import 'reflect-metadata';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { DataSource } from 'typeorm';
import {
  randomUUID,
  createHash,
  createSign,
  generateKeyPairSync,
} from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { APP_GUARD, Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import request from 'supertest';
import {
  AccountAccessGuard,
  AccountAuthorityClient,
  ApiExceptionFilter,
  JwtAuthGuard,
  JwtVerifier,
  OwnershipGuard,
  RolesGuard,
} from '@loccoc/common';
import { SocialRepository } from '../src/social/social.repository.js';
import { SocialService } from '../src/social/social.service.js';
import { SocialController } from '../src/social/social.controller.js';
import { AccountEventsConsumer } from '../src/social/account-events.consumer.js';
import { User } from '../src/users/entities/user.entity.js';
import { UsersController } from '../src/users/users.controller.js';
import { UsersRepository } from '../src/users/users.repository.js';
import { UsersService } from '../src/users/users.service.js';
import { CreateUsersTable1710000000000 } from '../src/database/migrations/1710000000000-CreateUsersTable.js';
import { UserSocial1793145600000 } from '../src/database/migrations/1793145600000-UserSocial.js';
import { AUTH_MIGRATIONS } from '../../auth-service/src/database/database.module.js';
import { AccountAccessService } from '../../auth-service/src/auth/account-access.service.js';
import {
  InternalAccountsController,
  InternalServiceGuard,
} from '../../auth-service/src/auth/internal-accounts.controller.js';
import { AccountStatusController } from '../../auth-service/src/auth/account-status.controller.js';
import { GatewayAccountAccessGuard } from '../../api-gateway/src/account-access.guard.js';
import { ServiceProxyController } from '../../api-gateway/src/service-proxy.controller.js';
import { AccountEventsPublisher } from '../../auth-service/src/auth/account-events.publisher.js';
import { Kafka, logLevel } from 'kafkajs';

const url = process.env.SOCIAL_TEST_DB_URL;
describe.skipIf(!url)(
  'social graph on real PostgreSQL and HTTP authority',
  () => {
    let admin: DataSource,
      db: DataSource,
      authDb: DataSource,
      repo: SocialRepository;
    let userApp: INestApplication,
      authApp: INestApplication,
      gateway: INestApplication;
    let client: AccountAuthorityClient, authority: AccountAccessService;
    const suffix = randomUUID().replaceAll('-', '');
    const userSchema = `social_user_${suffix}`,
      authSchema = `social_auth_${suffix}`;
    const ids = [randomUUID(), randomUUID(), randomUUID(), randomUUID()];
    const tokens: string[] = [];
    const { publicKey, privateKey } = generateKeyPairSync('rsa', {
      modulusLength: 2048,
    });
    const settings: Record<string, unknown> = {
      NODE_ENV: 'test',
      INTERNAL_SERVICE_TOKEN: 'isolated-integration-token-1234567890123456',
      JWT_PUBLIC_KEY: publicKey
        .export({ format: 'pem', type: 'spki' })
        .toString(),
      JWT_ISSUER: 'loccoc-auth',
      JWT_AUDIENCE: 'loccoc-api',
      JWT_KID: 'loccoc-2026-01',
    };
    const config = new ConfigService(settings);
    function bearer(index: number) {
      return `Bearer ${tokens[index]}`;
    }
    async function count(table: string) {
      return Number(
        (await db.query(`SELECT count(*) AS n FROM ${table}`))[0].n,
      );
    }
    async function rebuildUsers() {
      for (let i = 0; i < ids.length; i++) {
        const snapshot = await authority.snapshot(ids[i]!);
        await repo.project(snapshot);
        await repo.claim(
          ids[i]!,
          i === 0 ? 'alice' : i === 1 ? 'an' : i === 2 ? 'anh' : 'admin',
          'Visible name',
        );
      }
    }
    beforeAll(async () => {
      admin = await new DataSource({ type: 'postgres', url }).initialize();
      await admin.query(
        `CREATE SCHEMA ${userSchema}; CREATE SCHEMA ${authSchema}`,
      );
      db = await new DataSource({
        type: 'postgres',
        url,
        schema: userSchema,
        entities: [User],
        extra: { options: `-c search_path=${userSchema},public` },
      }).initialize();
      authDb = await new DataSource({
        type: 'postgres',
        url,
        schema: authSchema,
        extra: { options: `-c search_path=${authSchema},public` },
      }).initialize();
      const q = db.createQueryRunner();
      await new CreateUsersTable1710000000000().up(q);
      await db.query('INSERT INTO users(id,email,full_name) VALUES($1,$2,$3)', [
        ids[0],
        'a@test.example',
        'Preserved name',
      ]);
      await new UserSocial1793145600000().up(q);
      await q.release();
      expect(
        (await db.query('SELECT display_name FROM users'))[0].display_name,
      ).toBe('Preserved name');
      const aq = authDb.createQueryRunner();
      for (const M of AUTH_MIGRATIONS) await new M().up(aq);
      await aq.release();
      repo = new SocialRepository(db);
      authority = new AccountAccessService(authDb, config, new JwtVerifier());
      const a = await Test.createTestingModule({
        controllers: [InternalAccountsController, AccountStatusController],
        providers: [
          { provide: ConfigService, useValue: config },
          { provide: AccountAccessService, useValue: authority },
          InternalServiceGuard,
        ],
      }).compile();
      authApp = a.createNestApplication();
      authApp.useGlobalPipes(
        new ValidationPipe({
          transform: true,
          whitelist: true,
          forbidNonWhitelisted: true,
        }),
      );
      await authApp.listen(0, '127.0.0.1');
      settings.AUTH_SERVICE_URL = await authApp.getUrl();
      client = new AccountAuthorityClient(config);
      const u = await Test.createTestingModule({
        controllers: [SocialController, UsersController],
        providers: [
          { provide: SocialRepository, useValue: repo },
          SocialService,
          UsersService,
          {
            provide: UsersRepository,
            useValue: new UsersRepository(db.getRepository(User)),
          },
          { provide: AccountAuthorityClient, useValue: client },
          { provide: ConfigService, useValue: config },
          Reflector,
          JwtVerifier,
          { provide: APP_GUARD, useClass: JwtAuthGuard },
          { provide: APP_GUARD, useClass: AccountAccessGuard },
          { provide: APP_GUARD, useClass: RolesGuard },
          { provide: APP_GUARD, useClass: OwnershipGuard },
        ],
      }).compile();
      userApp = u.createNestApplication();
      userApp.useGlobalPipes(
        new ValidationPipe({
          transform: true,
          whitelist: true,
          forbidNonWhitelisted: true,
        }),
      );
      userApp.useGlobalFilters(new ApiExceptionFilter());
      await userApp.listen(0, '127.0.0.1');
      settings.USER_SERVICE_URL = await userApp.getUrl();
      const g = await Test.createTestingModule({
        controllers: [ServiceProxyController],
        providers: [
          Reflector,
          { provide: ConfigService, useValue: config },
          { provide: AccountAuthorityClient, useValue: client },
          { provide: APP_GUARD, useClass: GatewayAccountAccessGuard },
        ],
      }).compile();
      gateway = g.createNestApplication();
      gateway.useGlobalFilters(new ApiExceptionFilter());
      await gateway.init();
    }, 30000);
    beforeEach(async () => {
      await db.query(
        'TRUNCATE user_blocks,friendships,friend_requests,users CASCADE',
      );
      await authDb.query('TRUNCATE sessions,account_events,accounts CASCADE');
      tokens.length = 0;
      for (let i = 0; i < ids.length; i++) {
        await authDb.query(
          "INSERT INTO accounts(id,email,password_hash,status,role) VALUES($1,$2,'hash','active',$3)",
          [ids[i], `${i}@test.example`, i === 3 ? 'admin' : 'user'],
        );
        const sid = randomUUID();
        await authDb.query(
          "INSERT INTO sessions(id,user_id,refresh_token_hash,expires_at) VALUES($1,$2,$3,now()+interval '1 hour')",
          [sid, ids[i], createHash('sha256').update(sid).digest('hex')],
        );
        const enc = (v: unknown) =>
          Buffer.from(JSON.stringify(v)).toString('base64url');
        const now = Math.floor(Date.now() / 1000);
        const input = `${enc({ alg: 'RS256', kid: 'loccoc-2026-01', typ: 'JWT' })}.${enc({ sub: ids[i], sid, role: i === 3 ? 'admin' : 'user', iat: now, exp: now + 900, iss: 'loccoc-auth', aud: 'loccoc-api' })}`;
        tokens.push(
          `${input}.${createSign('RSA-SHA256').update(input).end().sign(privateKey).toString('base64url')}`,
        );
      }
      await rebuildUsers();
    });
    afterAll(async () => {
      await gateway?.close();
      await userApp?.close();
      await authApp?.close();
      await db?.destroy();
      await authDb?.destroy();
      if (admin?.isInitialized) {
        await admin.query(
          `DROP SCHEMA IF EXISTS ${userSchema} CASCADE; DROP SCHEMA IF EXISTS ${authSchema} CASCADE`,
        );
        await admin.destroy();
      }
    });

    it('reads exact username links with safe fields and all relationship states without creating requests', async () => {
      const get = (username: string, viewer = 0) =>
        request(userApp.getHttpServer())
          .get(`/users/profiles/by-username/${username}`)
          .set('Authorization', bearer(viewer));
      const none = await get('AN').expect(200);
      expect(none.body).toEqual({
        id: ids[1],
        username: 'an',
        displayName: 'Visible name',
        avatarUrl: null,
        relationshipStatus: 'NONE',
        friendRequestId: null,
      });
      expect((await get('alice').expect(200)).body.relationshipStatus).toBe(
        'SELF',
      );
      await get('ali').expect(404);
      expect(await count('friend_requests')).toBe(0);
      expect(await count('friendships')).toBe(0);
      const pending = await repo.send(ids[0]!, ids[1]!);
      expect((await get('an').expect(200)).body).toMatchObject({
        relationshipStatus: 'OUTGOING_PENDING',
        friendRequestId: pending.id,
      });
      expect((await get('alice', 1).expect(200)).body).toMatchObject({
        relationshipStatus: 'INCOMING_PENDING',
        friendRequestId: pending.id,
      });
      await repo.resolve(ids[1]!, pending.id, 'ACCEPTED');
      expect((await get('an').expect(200)).body).toMatchObject({
        relationshipStatus: 'FRIENDS',
        friendRequestId: null,
      });
      expect(await count('friend_requests')).toBe(1);
      expect(await count('friendships')).toBe(1);
    });

    it('hides username profiles when blocked, deleted, unavailable, or anonymous', async () => {
      const get = (name: string) =>
        request(userApp.getHttpServer())
          .get(`/users/profiles/by-username/${name}`)
          .set('Authorization', bearer(0));
      await request(gateway.getHttpServer())
        .get('/users/profiles/by-username/an')
        .expect(401);
      await repo.block(ids[1]!, ids[0]!);
      const blocked = await get('an').expect(404);
      const unknown = await get('missing').expect(404);
      expect(blocked.body.message).toEqual(unknown.body.message);
      await repo.unblock(ids[1]!, ids[0]!);
      await authDb.query("UPDATE accounts SET status='suspended' WHERE id=$1", [
        ids[1],
      ]);
      await get('an').expect(404); // User projection was still active before this read.
      await db.query('UPDATE users SET deleted_at=now() WHERE id=$1', [ids[2]]);
      await get('anh').expect(404);
      await get('bad-name').expect(400);
    });

    it('enforces case-normalized one-time username assignment in API and database', async () => {
      const id = ids[0]!;
      await db.query('DELETE FROM users WHERE id=$1', [id]);
      await repo.project(await authority.snapshot(id));
      const res = await request(userApp.getHttpServer())
        .post('/users/me/username')
        .set('Authorization', bearer(0))
        .send({ username: ' NEW_Name ', displayName: 'New' })
        .expect(201);
      expect(res.body.username).toBe('new_name');
      await request(userApp.getHttpServer())
        .post('/users/me/username')
        .set('Authorization', bearer(0))
        .send({ username: 'other' })
        .expect(409);
      await expect(
        db.query('UPDATE users SET username=NULL WHERE id=$1', [id]),
      ).rejects.toMatchObject({ code: '23514' });
      await request(userApp.getHttpServer())
        .patch('/users/me')
        .set('Authorization', bearer(0))
        .send({ username: 'other' })
        .expect(400);
      await db.query('DELETE FROM users WHERE id=$1', [ids[2]]);
      await repo.project(await authority.snapshot(ids[2]!));
      const taken = await request(userApp.getHttpServer())
        .post('/users/me/username')
        .set('Authorization', bearer(2))
        .send({ username: 'NEW_NAME' })
        .expect(409);
      expect(taken.body.code).toBe('USERNAME_TAKEN');
    });
    it('allows only one competing claim for the same username', async () => {
      for (const id of ids.slice(0, 2)) {
        await db.query('DELETE FROM users WHERE id=$1', [id]);
        await repo.project(await authority.snapshot(id));
      }
      const outcomes = await Promise.allSettled([
        repo.claim(ids[0]!, 'same'),
        repo.claim(ids[1]!, 'same'),
      ]);
      expect(outcomes.filter((x) => x.status === 'fulfilled')).toHaveLength(1);
    });
    it('only permits one initial assignment to the same account', async () => {
      await db.query('DELETE FROM users WHERE id=$1', [ids[0]]);
      await repo.project(await authority.snapshot(ids[0]!));
      const outcomes = await Promise.allSettled([
        repo.claim(ids[0]!, 'first'),
        repo.claim(ids[0]!, 'second'),
      ]);
      expect(outcomes.filter((x) => x.status === 'fulfilled')).toHaveLength(1);
    });
    it('requires onboarding and returns minimal paginated search with relationship direction', async () => {
      const r = await repo.send(ids[1]!, ids[0]!);
      const res = await request(userApp.getHttpServer())
        .get('/users/search?username=AN&limit=1')
        .set('Authorization', bearer(0))
        .expect(200);
      expect(res.body.hasMore).toBe(true);
      expect(res.body.data[0]).toMatchObject({
        username: 'an',
        relationshipStatus: 'INCOMING_PENDING',
        friendRequestId: r.id,
      });
      expect(Object.keys(res.body.data[0]).sort()).toEqual(
        [
          'avatarUrl',
          'displayName',
          'friendRequestId',
          'id',
          'relationshipStatus',
          'username',
        ].sort(),
      );
      const next = await request(userApp.getHttpServer())
        .get('/users/search?username=an&limit=1&page=2')
        .set('Authorization', bearer(0))
        .expect(200);
      expect(next.body.data[0].username).toBe('anh');
      await request(userApp.getHttpServer())
        .get('/users/search?username=an&limit=51')
        .set('Authorization', bearer(0))
        .expect(400);
      await request(userApp.getHttpServer())
        .get('/users/search?username=an')
        .expect(401);
      await db.query('DELETE FROM friend_requests');
      await db.query('DELETE FROM users WHERE id=$1', [ids[0]]);
      await repo.project(await authority.snapshot(ids[0]!));
      const missing = await request(userApp.getHttpServer())
        .get('/users/search?username=an')
        .set('Authorization', bearer(0))
        .expect(403);
      expect(missing.body.code).toBe('USERNAME_REQUIRED');
    });
    it('excludes self, suspended/deleted users and both directions of blocking', async () => {
      await repo.block(ids[1]!, ids[0]!);
      expect(
        (
          await repo.profiles(ids[0]!, { page: 1, limit: 20 }, 'search', 'an')
        ).data.map((u) => u.username),
      ).toEqual(['anh']);
      await expect(repo.profile(ids[0]!, ids[1]!)).rejects.toMatchObject({
        status: 404,
      });
      await expect(repo.send(ids[0]!, ids[1]!)).rejects.toMatchObject({
        status: 404,
      });
      await repo.project({
        ...(await authority.snapshot(ids[2]!)),
        status: 'suspended',
        version: 2,
      });
      expect(
        (await repo.profiles(ids[0]!, { page: 1, limit: 20 }, 'search', 'an'))
          .data,
      ).toHaveLength(0);
      expect(
        (
          await repo.profiles(
            ids[0]!,
            { page: 1, limit: 20 },
            'search',
            'alice',
          )
        ).data,
      ).toHaveLength(0);
    });
    it('escapes underscore in username prefix', async () => {
      await db.query('DELETE FROM users WHERE id=$1', [ids[2]]);
      await repo.project(await authority.snapshot(ids[2]!));
      await repo.claim(ids[2]!, 'an_one');
      expect(
        (
          await repo.profiles(ids[0]!, { page: 1, limit: 20 }, 'search', 'an_')
        ).data.map((u) => u.username),
      ).toEqual(['an_one']);
    });
    it('rejects self, duplicate, unauthorized and terminal transitions', async () => {
      await expect(repo.send(ids[0]!, ids[0]!)).rejects.toMatchObject({
        status: 409,
      });
      const r = await repo.send(ids[0]!, ids[1]!);
      await expect(repo.send(ids[0]!, ids[1]!)).rejects.toMatchObject({
        status: 409,
      });
      await expect(repo.send(ids[1]!, ids[0]!)).rejects.toMatchObject({
        status: 409,
      });
      await expect(
        repo.resolve(ids[2]!, r.id, 'ACCEPTED'),
      ).rejects.toMatchObject({ status: 404 });
      await expect(
        repo.resolve(ids[0]!, r.id, 'REJECTED'),
      ).rejects.toMatchObject({ status: 404 });
      const resolved = await repo.resolve(ids[1]!, r.id, 'ACCEPTED');
      expect(resolved.resolvedAt).toBeInstanceOf(Date);
      expect(await count('friendships')).toBe(1);
      expect((await repo.profile(ids[0]!, ids[1]!)).relationshipStatus).toBe(
        'FRIENDS',
      );
      expect(
        (await repo.profiles(ids[0]!, { page: 1, limit: 20 }, 'friends')).data,
      ).toHaveLength(1);
      await expect(
        repo.resolve(ids[1]!, r.id, 'REJECTED'),
      ).rejects.toMatchObject({ status: 409 });
      await expect(repo.send(ids[1]!, ids[0]!)).rejects.toMatchObject({
        status: 409,
      });
    });
    it('reject and cancel retain history; block removes friendship and unblock restores nothing', async () => {
      const a = await repo.send(ids[0]!, ids[1]!);
      await repo.resolve(ids[1]!, a.id, 'REJECTED');
      const b = await repo.send(ids[1]!, ids[0]!);
      await repo.resolve(ids[1]!, b.id, 'CANCELLED');
      const c = await repo.send(ids[0]!, ids[1]!);
      await repo.resolve(ids[1]!, c.id, 'ACCEPTED');
      await repo.block(ids[0]!, ids[1]!);
      expect(await count('friendships')).toBe(0);
      await repo.unblock(ids[1]!, ids[0]!);
      expect(await count('user_blocks')).toBe(1);
      await repo.unblock(ids[0]!, ids[1]!);
      expect(await count('friendships')).toBe(0);
      expect((await repo.profile(ids[0]!, ids[1]!)).relationshipStatus).toBe(
        'NONE',
      );
    });
    it('block cancels pending request and makes further resolution fail', async () => {
      const a = await repo.send(ids[0]!, ids[1]!);
      await repo.block(ids[1]!, ids[0]!);
      const rows = await db.query(
        'SELECT status,resolved_at FROM friend_requests WHERE id=$1',
        [a.id],
      );
      expect(rows[0].status).toBe('CANCELLED');
      expect(rows[0].resolved_at).not.toBeNull();
      await expect(
        repo.resolve(ids[1]!, a.id, 'ACCEPTED'),
      ).rejects.toMatchObject({ status: 409 });
    });
    it('rolls back request acceptance when friendship insert fails', async () => {
      const r = await repo.send(ids[0]!, ids[1]!);
      await db.query(`CREATE FUNCTION deny_friendship() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test'; END $$;
      CREATE TRIGGER test_deny BEFORE INSERT ON friendships FOR EACH ROW EXECUTE FUNCTION deny_friendship()`);
      try {
        await expect(repo.resolve(ids[1]!, r.id, 'ACCEPTED')).rejects.toThrow();
      } finally {
        await db.query(
          'DROP TRIGGER test_deny ON friendships; DROP FUNCTION deny_friendship()',
        );
      }
      expect(
        (
          await db.query(
            'SELECT status,resolved_at FROM friend_requests WHERE id=$1',
            [r.id],
          )
        )[0],
      ).toMatchObject({ status: 'PENDING', resolved_at: null });
    });
    it('allows exactly one simultaneous opposite-direction send', async () => {
      for (let i = 0; i < 8; i++) {
        await db.query('DELETE FROM friend_requests');
        const outcomes = await Promise.allSettled([
          repo.send(ids[0]!, ids[1]!),
          repo.send(ids[1]!, ids[0]!),
        ]);
        expect(outcomes.filter((x) => x.status === 'fulfilled')).toHaveLength(
          1,
        );
        expect(await count('friend_requests')).toBe(1);
      }
    });
    it('accept versus cancel has only one winning transition', async () => {
      const r = await repo.send(ids[0]!, ids[1]!);
      const outcomes = await Promise.allSettled([
        repo.resolve(ids[1]!, r.id, 'ACCEPTED'),
        repo.resolve(ids[0]!, r.id, 'CANCELLED'),
      ]);
      expect(outcomes.filter((x) => x.status === 'fulfilled')).toHaveLength(1);
      const state = (await db.query('SELECT status FROM friend_requests'))[0]
        .status;
      expect(await count('friendships')).toBe(state === 'ACCEPTED' ? 1 : 0);
    });
    it('accept versus block never leaves friendship or a pending invitation', async () => {
      const r = await repo.send(ids[0]!, ids[1]!);
      await Promise.allSettled([
        repo.resolve(ids[1]!, r.id, 'ACCEPTED'),
        repo.block(ids[0]!, ids[1]!),
      ]);
      expect(await count('user_blocks')).toBe(1);
      expect(await count('friendships')).toBe(0);
      expect(
        (
          await db.query(
            "SELECT id FROM friend_requests WHERE status='PENDING'",
          )
        ).length,
      ).toBe(0);
    });
    it('send versus accept never leaves a pending invitation alongside friendship', async () => {
      const r = await repo.send(ids[0]!, ids[1]!);
      await Promise.allSettled([
        repo.resolve(ids[1]!, r.id, 'ACCEPTED'),
        repo.send(ids[1]!, ids[0]!),
      ]);
      expect(await count('friendships')).toBe(1);
      expect(
        (
          await db.query(
            "SELECT id FROM friend_requests WHERE status='PENDING'",
          )
        ).length,
      ).toBe(0);
    });
    it('ignores repeated/stale account events and catches soft deletes in the outbox', async () => {
      await authDb.query("UPDATE accounts SET status='suspended' WHERE id=$1", [
        ids[1],
      ]);
      const snapshot = await authority.snapshot(ids[1]!);
      const consumer = new AccountEventsConsumer(repo, config);
      const event = {
        eventType: 'ACCOUNT_CHANGED',
        aggregateId: snapshot.id,
        version: snapshot.version,
        data: snapshot,
      };
      await consumer.apply(event);
      await consumer.apply(event);
      await consumer.apply({
        ...event,
        version: 1,
        data: { ...snapshot, status: 'active', version: 1 },
      });
      expect(
        (
          await db.query('SELECT account_status FROM users WHERE id=$1', [
            ids[1],
          ])
        )[0].account_status,
      ).toBe('suspended');
      await authDb.query('UPDATE accounts SET deleted_at=now() WHERE id=$1', [
        ids[1],
      ]);
      const events = await authDb.query(
        'SELECT data FROM account_events WHERE account_id=$1 ORDER BY version DESC',
        [ids[1]],
      );
      expect(events[0].data.status).toBe('deleted');
      await repo.project(events[0].data);
      expect(
        (
          await db.query('SELECT deleted_at FROM users WHERE id=$1', [ids[1]])
        )[0].deleted_at,
      ).not.toBeNull();
    });
    it('rejects suspended callers at gateway and directly at service despite valid token and stale projection', async () => {
      await authDb.query("UPDATE accounts SET status='suspended' WHERE id=$1", [
        ids[0],
      ]);
      expect(
        (
          await db.query('SELECT account_status FROM users WHERE id=$1', [
            ids[0],
          ])
        )[0].account_status,
      ).toBe('active');
      await request(gateway.getHttpServer())
        .get('/users/search?username=an')
        .set('Authorization', bearer(0))
        .expect(403);
      await request(userApp.getHttpServer())
        .get('/users/search?username=an')
        .set('Authorization', bearer(0))
        .expect(403);
      await authDb.query("UPDATE accounts SET status='active' WHERE id=$1", [
        ids[0],
      ]);
      await request(gateway.getHttpServer())
        .get('/users/search?username=an')
        .set('Authorization', bearer(0))
        .set('x-service-token', 'attacker')
        .expect(200);
    });
    it('checks target with authority before send, regardless of stale local active status', async () => {
      await authDb.query("UPDATE accounts SET status='suspended' WHERE id=$1", [
        ids[1],
      ]);
      await request(userApp.getHttpServer())
        .post('/users/friend-requests')
        .set('Authorization', bearer(0))
        .send({ receiverId: ids[1] })
        .expect(404);
      expect(await count('friend_requests')).toBe(0);
    });
    it('protects internal endpoints and does not expose them through gateway', async () => {
      await request(authApp.getHttpServer())
        .get('/internal/access')
        .set('Authorization', bearer(0))
        .expect(401);
      await request(gateway.getHttpServer())
        .get('/internal/access')
        .set('Authorization', bearer(0))
        .expect(404);
      await authDb.query(
        'UPDATE sessions SET revoked_at=now() WHERE user_id=$1',
        [ids[0]],
      );
      await request(userApp.getHttpServer())
        .get('/users/search?username=an')
        .set('Authorization', bearer(0))
        .expect(401);
    });
    it('routes account deletion through the authoritative service', async () => {
      await request(userApp.getHttpServer())
        .delete('/users/me')
        .set('Authorization', bearer(0))
        .expect(200);
      expect((await authority.snapshot(ids[0]!)).status).toBe('deleted');
      await request(userApp.getHttpServer())
        .get('/users/me')
        .set('Authorization', bearer(0))
        .expect(401);
    });

    it('restricts account moderation to a current administrator and rejects missing targets', async () => {
      await expect(
        authority.setStatus(ids[1]!, 'suspended', bearer(0)),
      ).rejects.toMatchObject({ status: 403 });
      const suspended = await authority.setStatus(
        ids[1]!,
        'suspended',
        bearer(3),
      );
      expect(suspended.status).toBe('suspended');
      await expect(authority.access(bearer(1))).rejects.toMatchObject({
        status: 403,
      });
      await expect(
        authority.setStatus(randomUUID(), 'suspended', bearer(3)),
      ).rejects.toMatchObject({ status: 404 });
      await expect(
        authority.setStatus(ids[3]!, 'suspended', bearer(3)),
      ).rejects.toMatchObject({ status: 403 });
      await authority.setStatus(ids[1]!, 'active', bearer(3));
      expect((await authority.access(bearer(1))).account.status).toBe('active');
      await authDb.query("UPDATE accounts SET role='user' WHERE id=$1", [
        ids[3],
      ]);
      await expect(
        authority.setStatus(ids[1]!, 'suspended', bearer(3)),
      ).rejects.toMatchObject({ status: 403 });
    });

    it('fails closed when the authority is unavailable', async () => {
      const offline = new AccountAuthorityClient(
        new ConfigService({
          ...settings,
          AUTH_SERVICE_URL: 'http://127.0.0.1:1',
        }),
      );
      await expect(offline.access(bearer(0))).rejects.toMatchObject({
        status: 503,
      });
      expect(() => offline.access('')).toThrow();
    });

    it.skipIf(!process.env.SOCIAL_TEST_KAFKA_BROKERS)(
      'delivers transactional outbox through real Kafka and ignores stale replay',
      async () => {
        const topic = `account.events.test.${suffix}`;
        const brokers = process.env.SOCIAL_TEST_KAFKA_BROKERS!;
        const kafka = new Kafka({
          clientId: 'social-integration',
          brokers: brokers.split(','),
          logLevel: logLevel.ERROR,
        });
        const kafkaAdmin = kafka.admin();
        await kafkaAdmin.connect();
        await kafkaAdmin.createTopics({
          topics: [{ topic, numPartitions: 1, replicationFactor: 1 }],
        });
        const eventConfig = new ConfigService({
          ...settings,
          NODE_ENV: 'development',
          KAFKA_BROKERS: brokers,
          ACCOUNT_EVENTS_TOPIC: topic,
        });
        const consumer = new AccountEventsConsumer(repo, eventConfig);
        const publisher = new AccountEventsPublisher(authDb, eventConfig);
        const producer = kafka.producer();
        try {
          await authDb.query(
            "UPDATE accounts SET status='suspended' WHERE id=$1",
            [ids[1]],
          );
          consumer.onModuleInit();
          await publisher.flush();
          const until = Date.now() + 20000;
          while (Date.now() < until) {
            if (
              (
                await db.query('SELECT account_status FROM users WHERE id=$1', [
                  ids[1],
                ])
              )[0].account_status === 'suspended'
            )
              break;
            await new Promise((resolve) => setTimeout(resolve, 100));
          }
          expect(
            (
              await db.query('SELECT account_status FROM users WHERE id=$1', [
                ids[1],
              ])
            )[0].account_status,
          ).toBe('suspended');
          expect(
            (
              await authDb.query(
                'SELECT id FROM account_events WHERE published_at IS NULL',
              )
            ).length,
          ).toBe(0);
          await producer.connect();
          const old = (
            await authDb.query(
              'SELECT data FROM account_events WHERE account_id=$1 AND version=1',
              [ids[1]],
            )
          )[0].data;
          await producer.send({
            topic,
            messages: [
              {
                key: ids[1],
                value: JSON.stringify({
                  eventId: randomUUID(),
                  eventType: 'ACCOUNT_CHANGED',
                  aggregateId: ids[1],
                  version: 1,
                  data: old,
                }),
              },
            ],
          });
          // A sentinel newer event on the same partition establishes that the replay was consumed.
          await authDb.query(
            "UPDATE accounts SET status='suspended' WHERE id=$1",
            [ids[1]],
          );
          await publisher.flush();
          const latest = await authority.snapshot(ids[1]!);
          const replayDeadline = Date.now() + 10000;
          while (Date.now() < replayDeadline) {
            if (
              Number(
                (
                  await db.query(
                    'SELECT account_version FROM users WHERE id=$1',
                    [ids[1]],
                  )
                )[0].account_version,
              ) === latest.version
            )
              break;
            await new Promise((resolve) => setTimeout(resolve, 100));
          }
          expect(
            (
              await db.query(
                'SELECT account_status,account_version FROM users WHERE id=$1',
                [ids[1]],
              )
            )[0],
          ).toMatchObject({
            account_status: 'suspended',
            account_version: String(latest.version),
          });
        } finally {
          await producer.disconnect();
          await consumer.onModuleDestroy();
          await publisher.onModuleDestroy();
          await kafkaAdmin.deleteTopics({ topics: [topic] });
          await kafkaAdmin.disconnect();
        }
      },
      40000,
    );
  },
);
