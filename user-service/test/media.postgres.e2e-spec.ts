import 'reflect-metadata';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { randomUUID, createSign, generateKeyPairSync } from 'node:crypto';
import { DataSource } from 'typeorm';
import { Test } from '@nestjs/testing';
import { APP_GUARD, Reflector } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import {
  ValidationPipe,
  UnauthorizedException,
  type INestApplication,
} from '@nestjs/common';
import request from 'supertest';
import sharp from 'sharp';
import {
  AccountAuthorityClient,
  AccountAccessGuard,
  ApiExceptionFilter,
  JwtAuthGuard,
  JwtVerifier,
} from '@loccoc/common';
import { USER_MIGRATIONS } from '../src/database/database.module.js';
import { ProfileMedia1794528000000 } from '../src/database/migrations/1794528000000-ProfileMedia.js';
import { User } from '../src/users/entities/user.entity.js';
import { UsersRepository } from '../src/users/users.repository.js';
import { UsersService } from '../src/users/users.service.js';
import { UsersController } from '../src/users/users.controller.js';
import { SocialRepository } from '../src/social/social.repository.js';
import { SocialService } from '../src/social/social.service.js';
import { SocialController } from '../src/social/social.controller.js';
import { MediaController } from '../src/media/media.controller.js';
import { MediaService } from '../src/media/media.service.js';
import { MediaStorage } from '../src/media/media.storage.js';
import { MediaRepository } from '../src/media/media.repository.js';
import { ServiceProxyController } from '../../api-gateway/src/service-proxy.controller.js';
import { GatewayAccountAccessGuard } from '../../api-gateway/src/account-access.guard.js';
import { configureGateway } from '../../api-gateway/src/bootstrap.js';

const url = process.env.MEDIA_TEST_DB_URL;
const endpoint = process.env.MEDIA_TEST_S3_ENDPOINT;
describe.skipIf(!url || !endpoint)(
  'profile media on isolated PostgreSQL + real S3 + HTTP Gateway',
  () => {
    let admin: DataSource,
      db: DataSource,
      app: INestApplication,
      gateway: INestApplication,
      media: MediaService;
    const schema = `media_${randomUUID().replaceAll('-', '')}`;
    const ids = [randomUUID(), randomUUID(), randomUUID()];
    const { publicKey, privateKey } = generateKeyPairSync('rsa', {
      modulusLength: 2048,
    });
    const tokens = ids.map((id) => {
      const now = Math.floor(Date.now() / 1000);
      const header = Buffer.from(
        JSON.stringify({ alg: 'RS256', typ: 'JWT', kid: 'loccoc-2026-01' }),
      ).toString('base64url');
      const payload = Buffer.from(
        JSON.stringify({
          sub: id,
          role: 'user',
          sid: randomUUID(),
          iat: now,
          exp: now + 3600,
          iss: 'loccoc-auth',
          aud: 'loccoc-api',
        }),
      ).toString('base64url');
      const input = `${header}.${payload}`;
      return `${input}.${createSign('RSA-SHA256').update(input).sign(privateKey).toString('base64url')}`;
    });
    const settings: Record<string, unknown> = {
      NODE_ENV: 'test',
      MEDIA_ENABLED: 'true',
      MEDIA_S3_ENDPOINT: endpoint,
      MEDIA_PUBLIC_BASE_URL: `${endpoint}/loccoc-media-test`,
      MEDIA_S3_BUCKET: 'loccoc-media-test',
      MEDIA_S3_ACCESS_KEY: process.env.MEDIA_TEST_S3_ACCESS_KEY,
      MEDIA_S3_SECRET_KEY: process.env.MEDIA_TEST_S3_SECRET_KEY,
      JWT_PUBLIC_KEY: publicKey
        .export({ format: 'pem', type: 'spki' })
        .toString(),
      CORS_ORIGINS: 'https://app.test',
    };
    const config = new ConfigService(settings);
    const authority = {
      access: async (bearer: string) => {
        const index = tokens.findIndex((token) => `Bearer ${token}` === bearer);
        if (index < 0) throw new UnauthorizedException();
        const id = ids[index]!;
        return {
          user: { userId: id, roles: ['user'], role: 'user' },
          account: {
            id,
            email: `${index}@media.test`,
            phone: null,
            status: 'active',
            version: 1,
          },
        };
      },
      account: async (id: string) => ({
        id,
        email: 'peer@media.test',
        phone: null,
        status: 'active',
        version: 1,
      }),
    };
    let storage: MediaStorage;
    let png: Buffer;
    const bearer = (i = 0) => `Bearer ${tokens[i]}`;
    const upload = (kind = 'avatar', i = 0) =>
      request(gateway.getHttpServer())
        .put(`/users/me/media/${kind}`)
        .set('Authorization', bearer(i))
        .set('Content-Type', 'image/png')
        .send(png);
    const me = (i = 0) =>
      request(gateway.getHttpServer())
        .get('/users/me')
        .set('Authorization', bearer(i));
    beforeAll(async () => {
      vi.stubEnv(
        'MEDIA_PUBLIC_BASE_URL',
        String(settings.MEDIA_PUBLIC_BASE_URL),
      );
      admin = await new DataSource({ type: 'postgres', url }).initialize();
      await admin.query(`CREATE SCHEMA ${schema}`);
      db = await new DataSource({
        type: 'postgres',
        url,
        schema,
        entities: [User],
        extra: { options: `-c search_path=${schema},public` },
      }).initialize();
      const q = db.createQueryRunner();
      for (const Migration of USER_MIGRATIONS) await new Migration().up(q);
      // Real rollback/reapply validates the additive migration before data is used.
      await new ProfileMedia1794528000000().down(q);
      await new ProfileMedia1794528000000().up(q);
      await q.release();
      for (let i = 0; i < 2; i++)
        await db.query(
          `INSERT INTO users(id,email,username,display_name,account_status,account_version,last_display_name_changed_at)
      VALUES($1,$2,$3,'Existing name','active',1,clock_timestamp())`,
          [ids[i], `${i}@media.test`, `media_${i}`],
        );
      const usersRepo = new UsersRepository(db.getRepository(User));
      const socialRepo = new SocialRepository(db);
      storage = new MediaStorage(config);
      const users = new UsersService(usersRepo, authority as never, socialRepo);
      media = new MediaService(
        storage,
        new MediaRepository(db),
        { eval: async () => 1 } as never,
        users,
      );
      const m = await Test.createTestingModule({
        controllers: [UsersController, MediaController, SocialController],
        providers: [
          Reflector,
          JwtVerifier,
          { provide: ConfigService, useValue: config },
          { provide: AccountAuthorityClient, useValue: authority },
          { provide: UsersService, useValue: users },
          {
            provide: SocialService,
            useValue: new SocialService(socialRepo, authority as never),
          },
          { provide: MediaService, useValue: media },
          { provide: APP_GUARD, useClass: JwtAuthGuard },
          { provide: APP_GUARD, useClass: AccountAccessGuard },
        ],
      }).compile();
      app = m.createNestApplication();
      app.useGlobalPipes(
        new ValidationPipe({
          transform: true,
          whitelist: true,
          forbidNonWhitelisted: true,
        }),
      );
      app.useGlobalFilters(new ApiExceptionFilter());
      await app.listen(0, '127.0.0.1');
      settings.USER_SERVICE_URL = await app.getUrl();
      const g = await Test.createTestingModule({
        controllers: [ServiceProxyController],
        providers: [
          Reflector,
          { provide: ConfigService, useValue: config },
          { provide: AccountAuthorityClient, useValue: authority },
          { provide: APP_GUARD, useClass: GatewayAccountAccessGuard },
        ],
      }).compile();
      gateway = g.createNestApplication();
      configureGateway(gateway);
      await gateway.init();
      png = await sharp({
        create: { width: 100, height: 80, channels: 3, background: 'red' },
      })
        .withMetadata({ exif: { IFD0: { Artist: 'private' } } })
        .png()
        .toBuffer();
    }, 30000);
    afterAll(async () => {
      await gateway?.close();
      await app?.close();
      storage?.onModuleDestroy();
      await db?.destroy();
      if (admin?.isInitialized) {
        await admin.query(`DROP SCHEMA ${schema} CASCADE`);
        await admin.destroy();
      }
      vi.unstubAllEnvs();
    });
    it('adds nullable cover while preserving existing name and cooldown', async () => {
      const response = await me().expect(200);
      expect(response.body.coverUrl).toBeNull();
      expect(response.body.displayName).toBe('Existing name');
      expect(response.body.lastDisplayNameChangedAt).toBeTruthy();
    });
    it('projects a newly authenticated account before its first upload', async () => {
      expect(await db.getRepository(User).findOneBy({ id: ids[2] })).toBeNull();
      const response = await upload('avatar', 2).expect(200);
      expect(response.body.id).toBe(ids[2]);
      expect(response.body.username).toBeNull();
      expect(response.body.avatarUrl).toContain(ids[2]);
    });
    it('uploads avatar and cover through Gateway, serves sanitized WebP and exposes safe cover', async () => {
      const before = (await me()).body;
      const avatar = await upload().expect(200);
      const cover = await upload('cover').expect(200);
      const served = await fetch(cover.body.coverUrl);
      expect(served.status).toBe(200);
      expect(served.headers.get('content-type')).toBe('image/webp');
      expect((await fetch(`${endpoint}/loccoc-media-test`)).status).toBe(403);
      expect(
        (
          await fetch(cover.body.coverUrl, {
            method: 'PUT',
            body: 'anonymous replacement',
          })
        ).status,
      ).toBe(403);
      const meta = await sharp(
        Buffer.from(await served.arrayBuffer()),
      ).metadata();
      expect(meta.exif).toBeUndefined();
      expect(cover.body.lastDisplayNameChangedAt).toBe(
        before.lastDisplayNameChangedAt,
      );
      expect(cover.body.avatarUrl).toBe(avatar.body.avatarUrl);
      await request(app.getHttpServer())
        .patch('/users/me')
        .set('Authorization', bearer())
        .send({ avatarUrl: avatar.body.avatarUrl })
        .expect(200);
      await request(app.getHttpServer())
        .patch('/users/me')
        .set('Authorization', bearer())
        .send({ displayName: 'Too soon', coverUrl: '' })
        .expect(409);
      expect((await me()).body.coverUrl).toBe(cover.body.coverUrl);
      const peer = await request(app.getHttpServer())
        .get(`/users/profiles/${ids[0]}`)
        .set('Authorization', bearer(1))
        .expect(200);
      expect(peer.body.coverUrl).toBe(cover.body.coverUrl);
      expect(peer.body.email).toBeUndefined();
      expect(peer.body.phone).toBeUndefined();
    });
    it('only writes the authenticated owner; rejects IDOR paths, forged owner headers and managed PATCH attachment', async () => {
      const before = (await me(1)).body;
      await request(app.getHttpServer())
        .put(`/users/${ids[1]}/media/avatar`)
        .set('Authorization', bearer())
        .set('Content-Type', 'image/png')
        .send(png)
        .expect(404);
      await request(app.getHttpServer())
        .put('/users/me/media/avatar')
        .set('Content-Type', 'image/png')
        .send(png)
        .expect(401);
      const own = await request(app.getHttpServer())
        .put('/users/me/media/avatar')
        .set('Authorization', bearer())
        .set('x-user-id', ids[1]!)
        .set('Content-Type', 'image/png')
        .send(png)
        .expect(200);
      expect((await me(1)).body.avatarUrl).toBe(before.avatarUrl);
      await request(app.getHttpServer())
        .patch('/users/me')
        .set('Authorization', bearer(1))
        .send({ avatarUrl: own.body.avatarUrl })
        .expect(400);
      await request(app.getHttpServer())
        .delete(`/users/${ids[1]}/media/avatar`)
        .set('Authorization', bearer())
        .expect(404);
    });
    it('rejects magic-byte spoofing, SVG, oversized files and disallowed URL schemes', async () => {
      await request(app.getHttpServer())
        .put('/users/me/media/avatar')
        .set('Authorization', bearer())
        .set('Content-Type', 'image/png')
        .send(Buffer.from('<svg/>'))
        .expect(400);
      await request(app.getHttpServer())
        .put('/users/me/media/cover')
        .set('Authorization', bearer())
        .set('Content-Type', 'image/png')
        .send(Buffer.alloc(10 * 1024 * 1024 + 1))
        .expect(413);
      for (const value of [
        'data:image/png;base64,AA',
        'file:///a',
        'javascript:alert(1)',
        'https://unapproved.test/a',
      ])
        await request(app.getHttpServer())
          .patch('/users/me')
          .set('Authorization', bearer())
          .send({ coverUrl: value })
          .expect(400);
    });
    it('keeps the old image if S3 or DB fails and cleans staged or replaced objects only after commit', async () => {
      const before = (await me()).body.avatarUrl;
      const put = vi
        .spyOn(storage, 'put')
        .mockRejectedValueOnce(new Error('store offline'));
      await upload().expect(503);
      put.mockRestore();
      expect((await me()).body.avatarUrl).toBe(before);
      await db.query(`CREATE FUNCTION reject_media_write() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test rollback'; END $$;
      CREATE TRIGGER reject_media BEFORE UPDATE OF avatar_url ON users FOR EACH ROW EXECUTE FUNCTION reject_media_write()`);
      await upload().expect(500);
      await db.query(
        'DROP TRIGGER reject_media ON users; DROP FUNCTION reject_media_write()',
      );
      expect((await me()).body.avatarUrl).toBe(before);
      expect((await fetch(before)).status).toBe(200);
      const next = await upload().expect(200);
      await db.query(
        `UPDATE profile_media_objects SET available_at=clock_timestamp()-interval '1 second' WHERE state='staged'`,
      );
      const removed = vi
        .spyOn(storage, 'remove')
        .mockRejectedValueOnce(new Error('retry'));
      await media.cleanup();
      removed.mockRestore();
      await db.query(
        `UPDATE profile_media_objects SET available_at=clock_timestamp()-interval '1 second' WHERE state<>'active'`,
      );
      await media.cleanup();
      await media.cleanup();
      expect((await fetch(before)).status).toBe(404);
      expect((await fetch(next.body.avatarUrl)).status).toBe(200);
      expect(
        (
          await db.query(
            "SELECT * FROM profile_media_objects WHERE state='staged'",
          )
        ).length,
      ).toBe(0);
    });
    it('serializes concurrent replacements and idempotent removal without spending name cooldown', async () => {
      const before = (await me()).body.lastDisplayNameChangedAt;
      const results = await Promise.all([upload(), upload()]);
      expect(results.map((x) => x.status)).toEqual([200, 200]);
      const current = (await me()).body.avatarUrl;
      await media.cleanup();
      expect((await fetch(current)).status).toBe(200);
      for (let i = 0; i < 2; i++)
        await request(gateway.getHttpServer())
          .delete('/users/me/media/avatar')
          .set('Authorization', bearer())
          .expect(200);
      await request(gateway.getHttpServer())
        .patch('/users/me')
        .set('Authorization', bearer())
        .send({ coverUrl: '' })
        .expect(200);
      const after = (await me()).body;
      expect(after.avatarUrl).toBeNull();
      expect(after.coverUrl).toBeNull();
      expect(after.lastDisplayNameChangedAt).toBe(before);
      await media.cleanup();
      expect((await fetch(current)).status).toBe(404);
    });
    it('enforces quota and fails closed if Redis is unavailable', async () => {
      const limited = new MediaService(storage, new MediaRepository(db), {
        eval: async () => 11,
      } as never);
      await expect(limited.quota(ids[0]!)).rejects.toMatchObject({
        status: 429,
      });
      const unavailable = new MediaService(storage, new MediaRepository(db), {
        eval: async () => {
          throw new Error();
        },
      } as never);
      await expect(unavailable.quota(ids[0]!)).rejects.toMatchObject({
        status: 503,
      });
    });
    it('retires account media on soft deletion without clearing another owner', async () => {
      const uploaded = await upload('cover', 1).expect(200);
      await db.query(
        `UPDATE users SET deleted_at=clock_timestamp(),account_status='deleted' WHERE id=$1`,
        [ids[1]],
      );
      await media.cleanup();
      expect((await fetch(uploaded.body.coverUrl)).status).toBe(404);
    });
  },
);
