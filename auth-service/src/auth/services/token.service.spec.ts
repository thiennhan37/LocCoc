import { createSign, generateKeyPairSync } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthService } from '../auth.service.js';
import { AccountRole, AccountStatus } from '../entities/account.entity.js';
import { Session } from '../entities/session.entity.js';
import { RefreshToken } from '../entities/refresh-token.entity.js';
import { randomUUID } from 'node:crypto';
import { PasswordService } from './password.service.js';
import { TokenService } from './token.service.js';
import { JwtVerifier } from '@loccoc/common';
import type { Account } from '../entities/account.entity.js';
import type { EntityManager } from 'typeorm';

const generatedKeys = generateKeyPairSync('rsa', { modulusLength: 2048 });
const privateKey = generatedKeys.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
const publicKey = generatedKeys.publicKey.export({ type: 'spki', format: 'pem' }).toString();

function config(): ConfigService {
  const values: Record<string, unknown> = {
    JWT_PRIVATE_KEY: privateKey,
    JWT_PUBLIC_KEY: publicKey,
    JWT_ISSUER: 'loccoc-auth',
    JWT_AUDIENCE: 'loccoc-api',
    JWT_KID: 'test-key',
    JWT_ACCESS_TTL_SECONDS: 900,
    JWT_REFRESH_TTL_SECONDS: 2_592_000,
  };
  return { get: (key: string, fallback?: unknown) => values[key] ?? fallback, getOrThrow: (key: string) => values[key] } as ConfigService;
}

type RecordData = Record<string, any>;

function createHarness() {
  const tokenService = new TokenService(config());
  const account: RecordData = {
    id: '00000000-0000-0000-0000-000000000001',
    email: 'person@example.com',
    passwordHash: '',
    role: AccountRole.USER,
    status: AccountStatus.ACTIVE,
    phone: null,
  };
  const sessions: RecordData[] = [];
  const refreshRecords: RecordData[] = [];
  const matches = (record: RecordData, criteria: RecordData) => Object.entries(criteria).every(([key, expected]) => {
    if ((expected as { _type?: string })?._type === 'isNull') return record[key] === null;
    return record[key] === expected;
  });
  const accountRepo = {
    findOne: async ({ where }: any) => (where.id === account.id || where.email === account.email) ? account : null,
    create: (value: RecordData) => value,
    save: async (value: RecordData) => value,
  };
  const sessionRepo = {
    create: (value: RecordData) => ({ ...value }),
    save: async (value: RecordData) => {
      const index = sessions.findIndex((candidate) => candidate.id === value.id);
      if (index < 0) sessions.push(value); else sessions[index] = value;
      return value;
    },
    findOne: async ({ where }: any) => sessions.find((candidate) => matches(candidate, where)) ?? null,
    find: async ({ where }: any = {}) => sessions.filter((candidate) => !where || matches(candidate, where)),
    update: async (criteria: RecordData, values: RecordData) => {
      let affected = 0;
      for (const session of sessions) if (matches(session, criteria)) { Object.assign(session, values); affected += 1; }
      return { affected };
    },
  };
  const refreshRepo = {
    create: (value: RecordData) => ({ id: `rt-${refreshRecords.length + 1}`, ...value }),
    save: async (value: RecordData) => {
      value.id ??= randomUUID();
      const index = refreshRecords.findIndex((candidate) => candidate.id === value.id);
      if (index < 0) refreshRecords.push(value); else refreshRecords[index] = value;
      return value;
    },
    findOne: async ({ where }: any) => refreshRecords.find((candidate) => matches(candidate, where)) ?? null,
    update: async (criteria: RecordData, values: RecordData) => {
      let affected = 0;
      for (const token of refreshRecords) if (matches(token, criteria)) { Object.assign(token, values); affected += 1; }
      return { affected };
    },
  };
  let queue = Promise.resolve();
  const manager = { getRepository: (entity: unknown) => entity === Session ? sessionRepo : entity === RefreshToken ? refreshRepo : accountRepo };
  const dataSource = {
    transaction: async <T>(callback: (value: typeof manager) => Promise<T>): Promise<T> => {
      const result = queue.then(async () => {
        const sessionSnapshot = structuredClone(sessions);
        const tokenSnapshot = structuredClone(refreshRecords);
        const accountSnapshot = structuredClone(account);
        try { return await callback(manager); }
        catch (error) {
          sessions.splice(0, sessions.length, ...sessionSnapshot);
          refreshRecords.splice(0, refreshRecords.length, ...tokenSnapshot);
          Object.assign(account, accountSnapshot);
          throw error;
        }
      });
      queue = result.then(() => undefined, () => undefined);
      return result;
    },
  };
  const mockRedis = { set: async () => 'OK', get: async () => null } as any;
  const mockConfig = { get: (key: string, def?: unknown) => def } as any;
  const auth = new AuthService(accountRepo as any, sessionRepo as any, refreshRepo as any, new PasswordService(), {} as any, mockRedis, mockConfig, tokenService, dataSource as any);
  const addSession = (id: string, refreshToken: string) => {
    const expiresAt = new Date(Date.now() + 60_000);
    sessions.push({ id, userId: account.id, refreshTokenHash: tokenService.hashRefreshToken(refreshToken), expiresAt, revokedAt: null, lastUsedAt: new Date(), deviceInfo: null, ip: null });
    refreshRecords.push({ id: `rt-${id}`, sessionId: id, userId: account.id, tokenHash: tokenService.hashRefreshToken(refreshToken), expiresAt, usedAt: null, revokedAt: null, reuseDetectedAt: null });
  };
  return { auth, tokenService, account, sessions, refreshRecords, addSession, refreshRepo, manager, dataSource };
}
function signToken(payload: Record<string, unknown>, header: Record<string, unknown>, key: string): string {
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const input = `${encode(header)}.${encode(payload)}`;
  const signer = createSign('RSA-SHA256');
  signer.update(input);
  signer.end();
  return `${input}.${signer.sign(key).toString('base64url')}`;
}

describe('TokenService and session rotation', () => {
  afterEach(() => vi.restoreAllMocks());

  it('issues social sessions through TokenService and supports normal refresh, replay detection and logout', async () => {
    const { auth, tokenService, account, sessions, refreshRecords, manager, dataSource } = createHarness();
    account.passwordHash = null;
    const result = await dataSource.transaction(() => auth.createSocialSession(
      manager as unknown as EntityManager, account as Account,
      { ip: '127.0.0.1', userAgent: 'Mobile SDK', platform: 'ios' },
    ));
    expect(result).toMatchObject({ authenticated: true, tokenType: 'Bearer', expiresIn: 900, refreshExpiresIn: 2_592_000 });
    expect(result.user).not.toHaveProperty('passwordHash');
    const accessToken = result.accessToken as string;
    const refreshToken = result.refreshToken as string;
    expect(new JwtVerifier().verify(accessToken, {
      publicKey, issuer: 'loccoc-auth', audience: 'loccoc-api', kid: 'test-key',
    })).toMatchObject({ sub: account.id, role: 'user', sid: sessions[0].id });
    expect(sessions[0]).toMatchObject({ ip: '127.0.0.1', deviceInfo: { platform: 'ios', userAgent: 'Mobile SDK' } });
    expect(refreshRecords[0].tokenHash).toBe(tokenService.hashRefreshToken(refreshToken));
    expect(JSON.stringify(refreshRecords)).not.toContain(refreshToken);
    const next = await auth.refresh({ refreshToken });
    expect(next.refreshToken).not.toBe(refreshToken);
    await expect(auth.refresh({ refreshToken })).rejects.toThrow('Invalid refresh token');
    await expect(auth.refresh({ refreshToken: next.refreshToken })).rejects.toThrow('Invalid refresh token');
    const second = await dataSource.transaction(() => auth.createSocialSession(manager as unknown as EntityManager, account as Account, {}));
    await auth.logout({ userId: account.id, sessionId: sessions[1].id });
    await expect(auth.refresh({ refreshToken: second.refreshToken as string })).rejects.toThrow('Invalid refresh token');
    await expect(auth.login({ email: account.email, password: 'no-social-password' })).rejects.toThrow('Invalid credentials');
  });

  it('issues a verifiable RS256 access token with kid and an opaque refresh token', () => {
    const service = new TokenService(config());
    const refresh = service.createRefreshToken();
    const pair = service.issuePair({ id: 'u1', role: AccountRole.USER } as any, 's1', refresh);
    const header = JSON.parse(Buffer.from(pair.accessToken.split('.')[0], 'base64url').toString('utf8'));
    expect(header).toMatchObject({ alg: 'RS256', kid: 'test-key', typ: 'JWT' });
    expect(refresh).toHaveLength(43);
    expect(service.hashRefreshToken(refresh)).toHaveLength(64);
    const payload = new JwtVerifier().verify(pair.accessToken, { publicKey, issuer: 'loccoc-auth', audience: 'loccoc-api', kid: 'test-key' });
    expect(payload).toMatchObject({ sub: 'u1', role: AccountRole.USER, sid: 's1' });
  });

  it('rotates and revokes the session when an ancestor token is replayed', async () => {
    const { auth, tokenService, addSession, sessions, refreshRecords } = createHarness();
    const oldToken = tokenService.createRefreshToken();
    addSession('s1', oldToken);
    const next = await auth.refresh({ refreshToken: oldToken });
    expect(next.refreshToken).not.toBe(oldToken);
    const latest = await auth.refresh({ refreshToken: next.refreshToken });
    expect(refreshRecords).toHaveLength(3);
    expect(refreshRecords[0].usedAt).toBeInstanceOf(Date);
    await expect(auth.refresh({ refreshToken: oldToken })).rejects.toThrow('Invalid refresh token');
    expect(sessions[0].revokedAt).toBeInstanceOf(Date);
    expect(refreshRecords[0].reuseDetectedAt).toBeInstanceOf(Date);
    expect(refreshRecords.every((token) => token.revokedAt instanceof Date)).toBe(true);
    await expect(auth.refresh({ refreshToken: latest.refreshToken })).rejects.toThrow();
  });

  it('allows only one of two concurrent refresh requests', async () => {
    const { auth, tokenService, addSession } = createHarness();
    const refreshToken = tokenService.createRefreshToken();
    addSession('s1', refreshToken);
    const results = await Promise.allSettled([auth.refresh({ refreshToken }), auth.refresh({ refreshToken })]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
  });

  it('keeps another device session active after reuse', async () => {
    const { auth, tokenService, addSession, sessions } = createHarness();
    const oldToken = tokenService.createRefreshToken();
    const otherToken = tokenService.createRefreshToken();
    addSession('s1', oldToken);
    addSession('s2', otherToken);
    await auth.refresh({ refreshToken: oldToken });
    await expect(auth.refresh({ refreshToken: oldToken })).rejects.toThrow();
    expect(sessions[1].revokedAt).toBeNull();
    await expect(auth.refresh({ refreshToken: otherToken })).resolves.toHaveProperty('accessToken');
  });

  it('persists only hashes for login and logs out all token histories', async () => {
    const { auth, account, tokenService, refreshRecords, sessions } = createHarness();
    account.passwordHash = await new PasswordService().hash('current-password');
    const first = await auth.login({ email: account.email, password: 'current-password' });
    await auth.login({ email: account.email, password: 'current-password' });
    expect(refreshRecords).toHaveLength(2);
    expect(refreshRecords[0].tokenHash).toBe(tokenService.hashRefreshToken(first.refreshToken as string));
    expect(JSON.stringify(refreshRecords)).not.toContain(first.refreshToken);
    expect(await auth.logoutAll(account.id)).toEqual({ revokedSessions: 2 });
    expect(sessions.every((session) => session.revokedAt)).toBe(true);
    expect(refreshRecords.every((token) => token.revokedAt)).toBe(true);
    await expect(auth.refresh({ refreshToken: first.refreshToken as string })).rejects.toThrow();
  });

  it('rejects expired, wrongly signed and wrongly algorithmed access tokens', () => {
    const verifier = new JwtVerifier();
    const now = Math.floor(Date.now() / 1000);
    const base = { sub: 'u1', role: 'user', sid: 's1', iss: 'loccoc-auth', aud: 'loccoc-api', iat: now - 10, exp: now - 1 };
    const expired = signToken(base, { alg: 'RS256', typ: 'JWT', kid: 'test-key' }, privateKey);
    expect(() => verifier.verify(expired, { publicKey, issuer: 'loccoc-auth', audience: 'loccoc-api', kid: 'test-key' })).toThrow();
    const { privateKey: otherKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const wrongKey = signToken({ ...base, exp: now + 900 }, { alg: 'RS256', typ: 'JWT', kid: 'test-key' }, otherKey.export({ type: 'pkcs8', format: 'pem' }).toString());
    expect(() => verifier.verify(wrongKey, { publicKey, issuer: 'loccoc-auth', audience: 'loccoc-api', kid: 'test-key' })).toThrow();
    const wrongAlgorithm = signToken({ ...base, exp: now + 900 }, { alg: 'HS256', typ: 'JWT', kid: 'test-key' }, privateKey);
    expect(() => verifier.verify(wrongAlgorithm, { publicKey, issuer: 'loccoc-auth', audience: 'loccoc-api', kid: 'test-key' })).toThrow();
  });

  it('revokes only the current device and returns false on repeated logout', async () => {
    const { auth, tokenService, addSession, account, sessions, refreshRecords, refreshRepo } = createHarness();
    const refreshToken = tokenService.createRefreshToken();
    const otherToken = tokenService.createRefreshToken();
    addSession('s1', refreshToken);
    addSession('s2', otherToken);
    const current = { userId: account.id, sessionId: 's1' };
    expect(await auth.logout(current)).toEqual({ revoked: true });
    expect(sessions[0].revokedAt).toBeInstanceOf(Date);
    expect(refreshRecords[0].revokedAt).toEqual(sessions[0].revokedAt);
    expect(sessions[1].revokedAt).toBeNull();
    expect(refreshRecords[1].revokedAt).toBeNull();
    const revokedAt = sessions[0].revokedAt;
    const revokeTokens = vi.spyOn(refreshRepo, 'update');
    expect(await auth.logout(current)).toEqual({ revoked: false });
    expect(revokeTokens).not.toHaveBeenCalled();
    expect(sessions[0].revokedAt).toEqual(revokedAt);
    await expect(auth.refresh({ refreshToken })).rejects.toThrow('Invalid refresh token');
    await expect(auth.refresh({ refreshToken: otherToken })).resolves.toHaveProperty('accessToken');
  });

  it.each(['missing session', 'wrong owner', 'revoked session'])('skips token revocation for %s', async (scenario) => {
    const { auth, tokenService, addSession, account, sessions, refreshRecords, refreshRepo } = createHarness();
    addSession('s1', tokenService.createRefreshToken());
    if (scenario === 'revoked session') {
      const revokedAt = new Date();
      sessions[0].revokedAt = revokedAt;
      refreshRecords[0].revokedAt = revokedAt;
    }
    const before = structuredClone({ sessions, refreshRecords });
    const revokeTokens = vi.spyOn(refreshRepo, 'update');
    expect(await auth.logout({
      userId: scenario === 'wrong owner' ? 'another-user' : account.id,
      sessionId: scenario === 'missing session' ? 'missing' : 's1',
    })).toEqual({ revoked: false });
    expect(revokeTokens).not.toHaveBeenCalled();
    expect({ sessions, refreshRecords }).toEqual(before);
  });

  it('rolls back session revocation when token revocation fails', async () => {
    const { auth, tokenService, addSession, account, sessions, refreshRecords, refreshRepo } = createHarness();
    const refreshToken = tokenService.createRefreshToken();
    addSession('s1', refreshToken);
    vi.spyOn(refreshRepo, 'update').mockRejectedValueOnce(new Error('Token update failed'));
    await expect(auth.logout({ userId: account.id, sessionId: 's1' })).rejects.toThrow('Token update failed');
    expect(sessions[0].revokedAt).toBeNull();
    expect(refreshRecords[0].revokedAt).toBeNull();
    await expect(auth.refresh({ refreshToken })).resolves.toHaveProperty('accessToken');
  });

  it('revokes refresh tokens on logout and password change', async () => {
    const { auth, tokenService, addSession, account, refreshRecords } = createHarness();
    const password = new PasswordService();
    account.passwordHash = await password.hash('current-password');
    const refreshToken = tokenService.createRefreshToken();
    addSession('s1', refreshToken);
    await auth.logout({ userId: account.id, sessionId: 's1' });
    expect(refreshRecords[0].revokedAt).toBeInstanceOf(Date);
    expect(refreshRecords[0].reuseDetectedAt).toBeNull();
    await expect(auth.refresh({ refreshToken })).rejects.toThrow();

    const refreshAfterChange = tokenService.createRefreshToken();
    addSession('s2', refreshAfterChange);
    await auth.changePassword({ currentPassword: 'current-password', newPassword: 'new-password-2026' }, { userId: account.id, sessionId: 's2' });
    await expect(auth.refresh({ refreshToken: refreshAfterChange })).rejects.toThrow();
  });
});
