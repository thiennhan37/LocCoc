import { ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { Account, AccountRole, AccountStatus } from './entities/account.entity.js';
import { Identity } from './entities/identity.entity.js';
import type { VerifiedSocialIdentity } from './services/social-token-verifier.service.js';

@Injectable()
export class IdentitiesRepository {
  constructor(private readonly dataSource: DataSource) {}

  async withAccount<T>(
    claims: VerifiedSocialIdentity,
    appleName: string | undefined,
    issueSession: (manager: EntityManager, account: Account) => Promise<T>,
  ): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      try {
        return await this.dataSource.transaction(async (manager) => {
          const account = await this.resolveAccount(manager, claims, appleName);
          return issueSession(manager, account);
        });
      } catch (error) {
        // A competing first sign-in can win either the email or provider/subject
        // constraint. Roll back everything (including sessions), then resolve
        // the committed winner in a fresh transaction. Never swallow other errors.
        const code = typeof error === 'object' && error !== null ? (error as { code?: string }).code : undefined;
        if (attempt === 0 && code === '23505') continue;
        throw error;
      }
    }
  }

  private async resolveAccount(manager: EntityManager, claims: VerifiedSocialIdentity, appleName?: string): Promise<Account> {
    const identities = manager.getRepository(Identity);
    const accounts = manager.getRepository(Account);
    const identity = await identities.findOne({ where: { provider: claims.provider, providerUserId: claims.providerUserId } });
    if (identity) {
      const account = await accounts.findOne({ where: { id: identity.userId }, lock: { mode: 'pessimistic_write' } });
      this.assertActive(account);
      // Provider subject is authoritative on subsequent logins. Never re-link
      // by a changed email or overwrite Apple's one-time display-name snapshot.
      return account;
    }

    // Linking an unverified email lets an attacker claim a victim's email at
    // another provider and take over the victim's existing account. Only the
    // signed email_verified claim can authorize this automatic linking step.
    if (!claims.email || !claims.emailVerified) this.requireVerification();
    let account = await accounts.findOne({
      where: { email: claims.email }, withDeleted: true, lock: { mode: 'pessimistic_write' },
    });
    if (account) {
      // Never activate a pre-registered pending account: its password may have
      // been chosen by an attacker (account pre-hijacking). Require the existing
      // account verification/recovery flow instead of preserving that password.
      if (account.status === AccountStatus.PENDING_VERIFICATION && !account.deletedAt) this.requireVerification();
      this.assertActive(account);
    } else {
      account = await accounts.save(accounts.create({
        email: claims.email, phone: null, passwordHash: null,
        role: AccountRole.USER, status: AccountStatus.ACTIVE, emailVerifiedAt: new Date(),
      }));
    }
    await identities.save(identities.create({
      provider: claims.provider, providerUserId: claims.providerUserId,
      userId: account.id, email: claims.email,
      // Apple does not attest this name. It is first-insert-only display metadata.
      displayName: claims.provider === 'apple' ? appleName?.trim() || null : claims.name,
      isPrivateEmail: claims.isPrivateEmail,
    }));
    return account;
  }

  private assertActive(account: Account | null): asserts account is Account {
    if (!account || account.deletedAt || account.status !== AccountStatus.ACTIVE) {
      throw new UnauthorizedException('Account is unavailable');
    }
  }

  private requireVerification(): never {
    throw new ForbiddenException({
      code: 'SOCIAL_VERIFICATION_REQUIRED',
      message: 'Additional account verification is required before social sign-in can continue',
    });
  }
}
