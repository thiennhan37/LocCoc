import 'reflect-metadata';
import { randomUUID, generateKeyPairSync } from 'node:crypto';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { DataSource } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { APP_GUARD } from '@nestjs/core';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import request from 'supertest';
import {
  AccountAuthorityClient,
  ApiExceptionFilter,
  JwtAuthGuard,
  JwtVerifier,
  RolesGuard,
} from '@loccoc/common';
import { AUTH_MIGRATIONS } from '../src/database/database.module.js';
import { REDIS_CLIENT } from '../src/database/redis.tokens.js';
import { Account } from '../src/auth/entities/account.entity.js';
import { Session } from '../src/auth/entities/session.entity.js';
import { RefreshToken } from '../src/auth/entities/refresh-token.entity.js';
import { TokenService } from '../src/auth/services/token.service.js';
import { AuthService } from '../src/auth/auth.service.js';
import { AccountAccessService } from '../src/auth/account-access.service.js';
import { LocalAccountAccessGuard } from '../src/auth/account-access.guard.js';
import {
  InternalAccountsController,
  InternalServiceGuard,
} from '../src/auth/internal-accounts.controller.js';
import { SessionManagementController } from '../src/auth/session-management.controller.js';
import { SessionManagementService } from '../src/auth/session-management.service.js';
import { SessionManagementRepository } from '../src/auth/session-management.repository.js';
import { ServiceProxyController } from '../../api-gateway/src/service-proxy.controller.js';
import { GatewayAccountAccessGuard } from '../../api-gateway/src/account-access.guard.js';
import { SessionCleanupService } from '../src/auth/services/session-cleanup.service.js';
import { LoginHistory1793577600000 } from '../src/database/migrations/1793577600000-LoginHistory.js';

const url = process.env.SESSION_TEST_DB_URL;
describe.skipIf(!url)(
  'owned session API on isolated PostgreSQL through Gateway',
  () => {
    const schema = 'sessions_test_' + randomUUID().replaceAll('-', '');
    const owner = randomUUID(),
      other = randomUUID();
    const current = randomUUID(),
      target = randomUUID(),
      foreign = randomUUID(),
      expired = randomUUID(),
      revoked = randomUUID();
    const redis = {
      get: vi.fn(async () => null),
      set: vi.fn(async () => 'OK'),
    };
    let db: DataSource,
      admin: DataSource,
      authApp: INestApplication,
      gateway: INestApplication;
    let tokens: TokenService,
      authority: AccountAccessService,
      authService: AuthService;
    let ownerToken: string,
      targetToken: string,
      foreignToken: string,
      targetRefresh: string;
    const { privateKey, publicKey } = generateKeyPairSync('rsa', {
      modulusLength: 2048,
    });
    const settings: Record<string, unknown> = {
      NODE_ENV: 'test',
      JWT_PRIVATE_KEY: privateKey
        .export({ type: 'pkcs8', format: 'pem' })
        .toString(),
      JWT_PUBLIC_KEY: publicKey
        .export({ type: 'spki', format: 'pem' })
        .toString(),
      JWT_ACCESS_TTL_SECONDS: 900,
      INTERNAL_SERVICE_TOKEN: 'session-verification-service-token-1234567890',
    };
    const config = new ConfigService(settings);
    const get = (path = '/auth/sessions', token?: string) =>
      request(gateway.getHttpServer())
        .get(path)
        .set('Authorization', `Bearer ${token ?? ownerToken}`);
    const remove = (id: string, token?: string) =>
      request(gateway.getHttpServer())
        .delete(`/auth/sessions/${id}`)
        .set('Authorization', `Bearer ${token ?? ownerToken}`);

    beforeAll(async () => {
      admin = await new DataSource({ type: 'postgres', url }).initialize();
      await admin.query(`CREATE SCHEMA ${schema}`);
      db = await new DataSource({
        type: 'postgres',
        url,
        schema,
        entities: [Account, Session, RefreshToken],
        extra: { options: `-c search_path=${schema},public` },
      }).initialize();
      const q = db.createQueryRunner();
      try {
        for (const M of AUTH_MIGRATIONS) await new M().up(q);
      } finally {
        await q.release();
      }
      tokens = new TokenService(config);
      authority = new AccountAccessService(db, config, new JwtVerifier());
      authService = new AuthService(
        db.getRepository(Account),
        db.getRepository(Session),
        db.getRepository(RefreshToken),
        {} as never,
        {} as never,
        redis as never,
        config,
        tokens,
        db,
      );
      const authModule = await Test.createTestingModule({
        controllers: [SessionManagementController, InternalAccountsController],
        providers: [
          SessionManagementService,
          SessionManagementRepository,
          InternalServiceGuard,
          JwtVerifier,
          { provide: DataSource, useValue: db },
          { provide: ConfigService, useValue: config },
          { provide: AccountAccessService, useValue: authority },
          { provide: REDIS_CLIENT, useValue: redis },
          { provide: APP_GUARD, useClass: JwtAuthGuard },
          { provide: APP_GUARD, useClass: LocalAccountAccessGuard },
          { provide: APP_GUARD, useClass: RolesGuard },
        ],
      }).compile();
      authApp = authModule.createNestApplication();
      authApp.useGlobalPipes(
        new ValidationPipe({
          transform: true,
          whitelist: true,
          forbidNonWhitelisted: true,
        }),
      );
      authApp.useGlobalFilters(new ApiExceptionFilter());
      await authApp.listen(0, '127.0.0.1');
      settings.AUTH_SERVICE_URL = await authApp.getUrl();
      const g = await Test.createTestingModule({
        controllers: [ServiceProxyController],
        providers: [
          { provide: ConfigService, useValue: config },
          AccountAuthorityClient,
          { provide: APP_GUARD, useClass: GatewayAccountAccessGuard },
        ],
      }).compile();
      gateway = g.createNestApplication();
      gateway.useGlobalFilters(new ApiExceptionFilter());
      await gateway.init();
    }, 30000);

    beforeEach(async () => {
      vi.clearAllMocks();
      redis.set.mockResolvedValue('OK');
      await db.query('TRUNCATE account_events,accounts CASCADE');
      await db.query(
        "INSERT INTO accounts(id,email,password_hash,status) VALUES($1,'sessions-a@test.invalid','hash','active'),($2,'sessions-b@test.invalid','hash','active')",
        [owner, other],
      );
      for (const [sid, uid] of [
        [current, owner],
        [target, owner],
        [foreign, other],
        [expired, owner],
        [revoked, owner],
      ]) {
        const refresh = tokens.createRefreshToken();
        const session = db.getRepository(Session).create({
          id: sid!,
          userId: uid!,
          refreshTokenHash: tokens.hashRefreshToken(refresh),
          deviceInfo: { platform: 'android', userAgent: 'test-device' },
          ip: '127.0.0.1',
          expiresAt: new Date(
            Date.now() + (sid === expired ? -60000 : 3600000),
          ),
          revokedAt: sid === revoked ? new Date() : null,
        });
        await db.getRepository(Session).save(session);
        await db.getRepository(RefreshToken).save({
          sessionId: sid!,
          userId: uid!,
          tokenHash: tokens.hashRefreshToken(refresh),
          expiresAt: session.expiresAt,
        });
        const jwt = tokens.issuePair(
          { id: uid!, role: 'user' as Account['role'] },
          sid!,
          refresh,
        ).accessToken;
        if (sid === current) ownerToken = jwt;
        if (sid === target) {
          targetToken = jwt;
          targetRefresh = refresh;
        }
        if (sid === foreign) foreignToken = jwt;
      }
    });

    afterAll(async () => {
      await gateway?.close();
      await authApp?.close();
      await db?.destroy();
      if (admin?.isInitialized) {
        await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
        await admin.destroy();
      }
    });

    it('lists only owned active sessions with safe fields and current-session flag', async () => {
      const r = await get().expect(200);
      expect(r.headers['cache-control']).toBe('no-store');
      expect(r.body.items.map((s: { id: string }) => s.id).sort()).toEqual(
        [current, target].sort(),
      );
      const row = r.body.items.find((s: { id: string }) => s.id === current);
      expect(row.isCurrent).toBe(true);
      expect(Object.keys(row).sort()).toEqual(
        [
          'id',
          'device',
          'ip',
          'createdAt',
          'lastUsedAt',
          'expiresAt',
          'isCurrent',
        ].sort(),
      );
      expect(row.device).toEqual({
        platform: 'android',
        userAgent: 'test-device',
      });
      expect(JSON.stringify(r.body)).not.toContain(targetRefresh);
      expect(
        (await get('/auth/sessions', foreignToken).expect(200)).body.items.map(
          (s: { id: string }) => s.id,
        ),
      ).toEqual([foreign]);
    });

    it('history includes owned active, revoked and expired sessions without exposing credentials', async () => {
      const r = await get('/auth/sessions/history').expect(200);
      expect(r.headers['cache-control']).toBe('no-store');
      expect(r.body.items.map((s: { id: string }) => s.id).sort()).toEqual(
        [current, target, expired, revoked].sort(),
      );
      expect(
        r.body.items.find((s: { id: string }) => s.id === expired).status,
      ).toBe('EXPIRED');
      expect(
        r.body.items.find((s: { id: string }) => s.id === revoked).status,
      ).toBe('REVOKED');
      expect(
        r.body.items.find((s: { id: string }) => s.id === current).isCurrent,
      ).toBe(true);
      expect(JSON.stringify(r.body)).not.toContain(targetRefresh);
      expect(
        (await get('/auth/sessions/history', foreignToken).expect(200)).body
          .items,
      ).toHaveLength(1);
      await request(gateway.getHttpServer())
        .get('/auth/sessions/history')
        .expect(401);
    });

    it('history pagination is scoped to its purpose and current owner', async () => {
      const first = (await get('/auth/sessions/history?limit=2').expect(200))
        .body;
      const second = (
        await get(
          '/auth/sessions/history?limit=2&cursor=' + first.pageInfo.nextCursor,
        ).expect(200)
      ).body;
      expect(
        new Set(
          [...first.items, ...second.items].map((s: { id: string }) => s.id),
        ).size,
      ).toBe(4);
      const active = (await get('/auth/sessions?limit=1').expect(200)).body;
      await get(
        '/auth/sessions/history?cursor=' + active.pageInfo.nextCursor,
      ).expect(400);
      await get('/auth/sessions?cursor=' + first.pageInfo.nextCursor).expect(
        400,
      );
      await get(
        '/auth/sessions/history?cursor=' + first.pageInfo.nextCursor,
        foreignToken,
      ).expect(400);
    });

    it('history survives expired-session cleanup and applies 90-day retention without deleting active history', async () => {
      await db.query(
        "UPDATE login_history SET created_at=now()-interval '100 days' WHERE session_id IN ($1,$2)",
        [target, revoked],
      );
      const cleanup = new SessionCleanupService(
        db.getRepository(Session),
        db.getRepository(RefreshToken),
        db,
      );
      await cleanup.removeExpiredSessions();
      expect(
        await db.query('SELECT id FROM sessions WHERE id=$1', [expired]),
      ).toHaveLength(0);
      const ids = (
        await get('/auth/sessions/history').expect(200)
      ).body.items.map((s: { id: string }) => s.id);
      expect(ids).toContain(expired);
      expect(ids).toContain(target);
      expect(ids).not.toContain(revoked);
      expect(
        await db.query(
          'SELECT session_id FROM login_history WHERE session_id=$1',
          [revoked],
        ),
      ).toHaveLength(0);
    });

    it('migration backfills available preexisting sessions', async () => {
      const q = db.createQueryRunner();
      try {
        await new LoginHistory1793577600000().down(q);
        await new LoginHistory1793577600000().up(q);
      } finally {
        await q.release();
      }
      expect(
        (await get('/auth/sessions/history').expect(200)).body.items,
      ).toHaveLength(4);
    });

    it('session revocation updates history in the same transaction', async () => {
      await remove(target).expect(200);
      const item = (
        await get('/auth/sessions/history').expect(200)
      ).body.items.find((s: { id: string }) => s.id === target);
      expect(item.status).toBe('REVOKED');
      expect(item.revokedAt).toBeTypeOf('string');
    });

    it('rolled-back session creation leaves no successful-login history', async () => {
      const account = await db
        .getRepository(Account)
        .findOneByOrFail({ id: owner });
      await expect(
        db.transaction(async (manager) => {
          await authService.createSocialSession(manager, account, {
            platform: 'web',
          });
          throw Error('verification rollback');
        }),
      ).rejects.toThrow('verification rollback');
      expect(
        (await get('/auth/sessions/history').expect(200)).body.items,
      ).toHaveLength(4);
    });

    it('paginates timestamp ties without duplicates and omits sessions revoked between pages', async () => {
      await db.query(
        "UPDATE sessions SET created_at='2026-01-01 00:00:00.123456+00' WHERE user_id=$1",
        [owner],
      );
      await db.query(
        "UPDATE sessions SET created_at='2026-01-02 00:00:00.123456+00' WHERE id=$1",
        [current],
      );
      await db.query(
        `INSERT INTO sessions(id,user_id,refresh_token_hash,created_at,expires_at)
      VALUES($1,$2,$3,'2026-01-01 00:00:00.123456+00',now()+interval '1 hour')`,
        [randomUUID(), owner, 'e'.repeat(64)],
      );
      const first = (await get('/auth/sessions?limit=2').expect(200)).body;
      expect(first.pageInfo.hasMore).toBe(true);
      const second = (
        await get(
          '/auth/sessions?limit=2&cursor=' + first.pageInfo.nextCursor,
        ).expect(200)
      ).body;
      expect(second.pageInfo.hasMore).toBe(false);
      expect(
        new Set([
          ...first.items.map((s: { id: string }) => s.id),
          second.items[0].id,
        ]).size,
      ).toBe(3);
      await db.query('UPDATE sessions SET revoked_at=now() WHERE id=$1', [
        second.items[0].id,
      ]);
      expect(
        (
          await get(
            '/auth/sessions?limit=1&cursor=' + first.pageInfo.nextCursor,
          ).expect(200)
        ).body.items,
      ).toEqual([]);
    });

    it('validates limits, unknown filters, malformed and cross-account cursors and UUIDs', async () => {
      for (const query of [
        'limit=0',
        'limit=51',
        'limit=1.5',
        'userId=' + other,
        'cursor=garbage',
        'cursor=%',
      ])
        await get('/auth/sessions?' + query).expect(400);
      const page = (await get('/auth/sessions?limit=1').expect(200)).body;
      await get(
        '/auth/sessions?cursor=' + page.pageInfo.nextCursor,
        foreignToken,
      ).expect(400);
      for (const at of ['1', '2026-02-30T10:00:00Z', '0000-01-01T10:00:00Z']) {
        const cursor = Buffer.from(
          JSON.stringify({ v: 1, owner, at, id: target }),
        ).toString('base64url');
        await get('/auth/sessions?cursor=' + cursor).expect(400);
      }
      await remove('invalid-uuid').expect(400);
    });

    it('requires valid caller credentials and rejects suspended accounts', async () => {
      await request(gateway.getHttpServer()).get('/auth/sessions').expect(401);
      await request(authApp.getHttpServer()).get('/auth/sessions').expect(401);
      await request(gateway.getHttpServer())
        .delete('/auth/sessions/' + target)
        .expect(401);
      await db.query("UPDATE accounts SET status='suspended' WHERE id=$1", [
        owner,
      ]);
      await get().expect(403);
      await remove(target).expect(403);
    });

    it('does not reveal or revoke foreign sessions, even for an admin', async () => {
      const missing = await remove(randomUUID()).expect(404),
        foreignResult = await remove(foreign).expect(404);
      expect(foreignResult.body.message).toEqual(missing.body.message);
      await db.query("UPDATE accounts SET role='admin' WHERE id=$1", [owner]);
      await remove(foreign).expect(404);
      expect(
        (await get('/auth/sessions', foreignToken).expect(200)).body.items,
      ).toHaveLength(1);
      expect(redis.set).not.toHaveBeenCalled();
    });

    it('revokes the selected session and all refresh tokens, denies API and push, leaves caller active', async () => {
      await db.getRepository(RefreshToken).save({
        sessionId: target,
        userId: owner,
        tokenHash: 'f'.repeat(64),
        expiresAt: new Date(Date.now() + 3600000),
        usedAt: new Date(),
      });
      const r = await remove(target).expect(200);
      expect(r.body).toEqual({
        sessionId: target,
        revoked: true,
        isCurrent: false,
      });
      expect(redis.set).toHaveBeenCalledWith(
        `auth:revoked:sid:${target}`,
        '1',
        'EX',
        900,
      );
      const rows = await db.query(
        'SELECT revoked_at FROM refresh_tokens WHERE session_id=$1',
        [target],
      );
      expect(rows).toHaveLength(2);
      expect(rows.every((s: { revoked_at: unknown }) => s.revoked_at)).toBe(
        true,
      );
      await get('/auth/sessions', targetToken).expect(401);
      await request(authApp.getHttpServer())
        .get('/auth/sessions')
        .set('Authorization', 'Bearer ' + targetToken)
        .expect(401);
      expect(await authority.pushSession(owner, target)).toEqual({
        allowed: false,
      });
      await expect(
        authService.refresh({ refreshToken: targetRefresh }),
      ).rejects.toMatchObject({ status: 401 });
      expect(
        (await get().expect(200)).body.items.map((s: { id: string }) => s.id),
      ).toEqual([current]);
    });

    it('makes owned expired and repeated revocation successful no-ops', async () => {
      expect((await remove(expired).expect(200)).body.revoked).toBe(false);
      expect((await remove(revoked).expect(200)).body.revoked).toBe(false);
      await remove(target).expect(200);
      expect((await remove(target).expect(200)).body.revoked).toBe(false);
      expect(redis.set).toHaveBeenCalledTimes(1);
    });

    it('allows current-session revocation then rejects its next request', async () => {
      const r = await remove(current.toUpperCase()).expect(200);
      expect(r.body).toEqual({
        sessionId: current,
        revoked: true,
        isCurrent: true,
      });
      await get().expect(401);
    });

    it('keeps database revocation authoritative when Redis publication fails', async () => {
      redis.set.mockRejectedValueOnce(new Error('test cache unavailable'));
      await remove(target).expect(200);
      await get('/auth/sessions', targetToken).expect(401);
      await get().expect(200);
      expect(await authority.pushSession(owner, target)).toEqual({
        allowed: false,
      });
    });

    it('cannot resurrect a selected session by racing refresh against revocation', async () => {
      const results = await Promise.allSettled([
        authService.refresh({ refreshToken: targetRefresh }),
        remove(target).expect(200),
      ]);
      expect(results[1].status).toBe('fulfilled');
      expect(
        (
          await db.query('SELECT revoked_at FROM sessions WHERE id=$1', [
            target,
          ])
        )[0].revoked_at,
      ).not.toBeNull();
      expect(
        (
          await db.query(
            'SELECT count(*)::int AS count FROM refresh_tokens WHERE session_id=$1 AND revoked_at IS NULL',
            [target],
          )
        )[0].count,
      ).toBe(0);
      if (results[0].status === 'fulfilled')
        await expect(
          authService.refresh({ refreshToken: results[0].value.refreshToken }),
        ).rejects.toMatchObject({ status: 401 });
      await get('/auth/sessions', targetToken).expect(401);
    });

    it('serializes concurrent revocations and publishes a single successful change', async () => {
      const results = await Promise.all([
        remove(target).expect(200),
        remove(target).expect(200),
      ]);
      expect(results.map((r) => r.body.revoked).sort()).toEqual([false, true]);
      expect(redis.set).toHaveBeenCalledTimes(1);
    });

    it('rolls back session revocation if refresh-token revocation fails and publishes no marker', async () => {
      await db.query(`CREATE FUNCTION fail_refresh_revoke() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'verification rollback'; END $$;
      CREATE TRIGGER fail_refresh_revoke BEFORE UPDATE ON refresh_tokens
      FOR EACH ROW EXECUTE FUNCTION fail_refresh_revoke();`);
      try {
        await remove(target).expect(500);
        expect(
          (
            await db.query('SELECT revoked_at FROM sessions WHERE id=$1', [
              target,
            ])
          )[0].revoked_at,
        ).toBeNull();
        expect(redis.set).not.toHaveBeenCalled();
        expect(
          (
            await db.query(
              'SELECT revoked_at FROM login_history WHERE session_id=$1',
              [target],
            )
          )[0].revoked_at,
        ).toBeNull();
        await get('/auth/sessions', targetToken).expect(200);
      } finally {
        await db.query(
          'DROP TRIGGER fail_refresh_revoke ON refresh_tokens; DROP FUNCTION fail_refresh_revoke()',
        );
      }
    });
  },
);
