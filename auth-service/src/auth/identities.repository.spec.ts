import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DataSource, EntityManager } from 'typeorm';
import { describe, expect, it, vi } from 'vitest';
import { Account, AccountRole, AccountStatus } from './entities/account.entity.js';
import { Identity } from './entities/identity.entity.js';
import { IdentitiesRepository } from './identities.repository.js';
import type { VerifiedSocialIdentity } from './services/social-token-verifier.service.js';

const claims: VerifiedSocialIdentity = {
  provider: 'google', providerUserId: 'provider-subject', email: 'user@example.com',
  emailVerified: true, name: 'Signed Google Name', isPrivateEmail: false,
  expiresAt: Math.floor(Date.now() / 1000) + 600,
};

function harness() {
  const rows: { accounts: Account[]; identities: Identity[] } = { accounts: [], identities: [] };
  const accountRepo = {
    findOne: vi.fn(async ({ where, withDeleted }: { where: Partial<Account>; withDeleted?: boolean }) =>
      rows.accounts.find((account) => (withDeleted || !account.deletedAt) &&
        Object.entries(where).every(([key, value]) => account[key as keyof Account] === value)) ?? null),
    create: (data: Partial<Account>) => Object.assign(new Account(), { id: randomUUID(), deletedAt: null }, data),
    save: vi.fn(async (account: Account) => { rows.accounts.push(account); return account; }),
  };
  const identityRepo = {
    findOne: async ({ where }: { where: Partial<Identity> }) => rows.identities.find((identity) =>
      identity.provider === where.provider && identity.providerUserId === where.providerUserId) ?? null,
    create: (data: Partial<Identity>) => Object.assign(new Identity(), data),
    save: vi.fn(async (identity: Identity) => { rows.identities.push(identity); return identity; }),
  };
  const manager = { getRepository: (entity: unknown) => entity === Account ? accountRepo : identityRepo } as unknown as EntityManager;
  const transaction = vi.fn(async (operation: (m: EntityManager) => Promise<unknown>) => {
    const before = structuredClone(rows);
    try { return await operation(manager); }
    catch (error) { rows.accounts = before.accounts; rows.identities = before.identities; throw error; }
  });
  const repo = new IdentitiesRepository({ transaction } as unknown as DataSource);
  const issue = vi.fn(async (_manager: EntityManager, account: Account) => ({ userId: account.id }));
  const addAccount = (changes: Partial<Account> = {}) => {
    const account = accountRepo.create({
      email: claims.email!, passwordHash: 'existing-password-hash', phone: null,
      role: AccountRole.USER, status: AccountStatus.ACTIVE, emailVerifiedAt: new Date(), ...changes,
    });
    rows.accounts.push(account);
    return account;
  };
  return { repo, rows, issue, transaction, addAccount, accountRepo, identityRepo };
}

describe('transactional social identity resolution', () => {
  it('creates an active passwordless user and identity before issuing a session', async () => {
    const { repo, rows, issue } = harness();
    await repo.withAccount(claims, undefined, issue);
    expect(rows.accounts).toHaveLength(1);
    expect(rows.accounts[0]).toMatchObject({ passwordHash: null, role: 'user', status: 'active' });
    expect(rows.identities[0]).toMatchObject({ userId: rows.accounts[0].id, provider: 'google', providerUserId: claims.providerUserId, displayName: 'Signed Google Name' });
    expect(issue).toHaveBeenCalledOnce();
  });

  it('links a verified email to the existing active user without changing its password or privileges', async () => {
    const { repo, rows, addAccount, issue } = harness();
    const existing = addAccount({ role: AccountRole.ADMIN });
    await expect(repo.withAccount(claims, undefined, issue)).resolves.toEqual({ userId: existing.id });
    expect(rows.accounts).toHaveLength(1);
    expect(existing.passwordHash).toBe('existing-password-hash');
    expect(existing.role).toBe(AccountRole.ADMIN);
  });

  it.each([true, false])('requires verification for an unverified email (existing account: %s)', async (exists) => {
    const { repo, rows, addAccount, issue } = harness();
    if (exists) addAccount();
    await expect(repo.withAccount({ ...claims, emailVerified: false }, undefined, issue)).rejects.toBeInstanceOf(ForbiddenException);
    expect(issue).not.toHaveBeenCalled();
    expect(rows.identities).toHaveLength(0);
  });

  it('requires additional verification for email-free first login', async () => {
    const { repo, rows, issue } = harness();
    await expect(repo.withAccount({ ...claims, provider: 'apple', email: null }, undefined, issue)).rejects.toMatchObject({
      response: { code: 'SOCIAL_VERIFICATION_REQUIRED' },
    });
    expect(rows.accounts).toHaveLength(0);
  });

  it('blocks pre-hijacking of pending accounts without activating the attacker password', async () => {
    const { repo, rows, addAccount, issue } = harness();
    addAccount({ status: AccountStatus.PENDING_VERIFICATION, emailVerifiedAt: null });
    await expect(repo.withAccount(claims, undefined, issue)).rejects.toBeInstanceOf(ForbiddenException);
    expect(rows.accounts[0]).toMatchObject({ status: 'pending_verification', passwordHash: 'existing-password-hash' });
    expect(issue).not.toHaveBeenCalled();
  });

  it.each(['suspended', 'deleted'] as const)('does not link or issue tokens to a %s local account', async (state) => {
    const { repo, rows, addAccount, issue } = harness();
    addAccount(state === 'deleted' ? { deletedAt: new Date() } : { status: AccountStatus.SUSPENDED });
    await expect(repo.withAccount(claims, undefined, issue)).rejects.toBeInstanceOf(UnauthorizedException);
    expect(rows.identities).toHaveLength(0);
    expect(issue).not.toHaveBeenCalled();
  });

  it('preserves private relay email and first Apple name; subsequent missing email/name is supported', async () => {
    const { repo, rows, issue } = harness();
    const apple = { ...claims, provider: 'apple' as const, email: 'unique@privaterelay.appleid.com', isPrivateEmail: true, name: null };
    const first = await repo.withAccount(apple, 'First Name', issue);
    const second = await repo.withAccount({ ...apple, email: null, emailVerified: false }, 'Changed Name', issue);
    expect(second).toEqual(first);
    expect(rows.accounts).toHaveLength(1);
    expect(rows.identities).toHaveLength(1);
    expect(rows.identities[0]).toMatchObject({ email: apple.email, isPrivateEmail: true, displayName: 'First Name' });
  });

  it('never remaps a known provider subject when its signed email changes to another user', async () => {
    const { repo, rows, issue, addAccount } = harness();
    const first = await repo.withAccount(claims, undefined, issue);
    addAccount({ email: 'other@example.com' });
    const second = await repo.withAccount({ ...claims, email: 'other@example.com' }, undefined, issue);
    expect(second).toEqual(first);
    expect(rows.identities).toHaveLength(1);
  });

  it('rejects existing identities whose local account is suspended or deleted', async () => {
    const { repo, rows, issue } = harness();
    await repo.withAccount(claims, undefined, issue);
    rows.accounts[0].status = AccountStatus.SUSPENDED;
    await expect(repo.withAccount(claims, undefined, issue)).rejects.toBeInstanceOf(UnauthorizedException);
    rows.accounts[0].status = AccountStatus.ACTIVE;
    rows.accounts[0].deletedAt = new Date();
    await expect(repo.withAccount(claims, undefined, issue)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('keeps Google and Apple subjects separate even if their sub strings match', async () => {
    const { repo, rows, issue } = harness();
    await repo.withAccount(claims, undefined, issue);
    await repo.withAccount({ ...claims, provider: 'apple', email: 'relay@privaterelay.appleid.com' }, undefined, issue);
    expect(rows.accounts).toHaveLength(2);
    expect(rows.identities).toHaveLength(2);
  });

  it('rolls back identity and account creation if session issuance fails', async () => {
    const { repo, rows } = harness();
    await expect(repo.withAccount(claims, undefined, async () => { throw new Error('session failure'); })).rejects.toThrow('session failure');
    expect(rows.accounts).toHaveLength(0);
    expect(rows.identities).toHaveLength(0);
  });

  it('retries a unique-constraint race in a fresh transaction, at most once', async () => {
    const { repo, transaction, issue } = harness();
    transaction.mockRejectedValueOnce(Object.assign(new Error('concurrent insert'), { code: '23505' }));
    await repo.withAccount(claims, undefined, issue);
    expect(transaction).toHaveBeenCalledTimes(2);
    transaction.mockClear();
    transaction.mockRejectedValue(Object.assign(new Error('persistent conflict'), { code: '23505' }));
    await expect(repo.withAccount(claims, undefined, issue)).rejects.toThrow('persistent conflict');
    expect(transaction).toHaveBeenCalledTimes(2);
  });

  it('does not retry infrastructure errors', async () => {
    const { repo, transaction, issue } = harness();
    transaction.mockRejectedValueOnce(new Error('database unavailable'));
    await expect(repo.withAccount(claims, undefined, issue)).rejects.toThrow('database unavailable');
    expect(transaction).toHaveBeenCalledOnce();
  });
});
