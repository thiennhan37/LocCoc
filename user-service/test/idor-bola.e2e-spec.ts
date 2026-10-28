import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { createSign } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ApiExceptionFilter, REDIS_CLIENT } from '@loccoc/common';
import { AppModule } from '../src/app.module.js';
import { UsersRepository } from '../src/users/users.repository.js';
import { User } from '../src/users/entities/user.entity.js';

function signTestToken(
  userId: string,
  role: string,
  sessionId: string,
  privateKey: string,
  options: { kid?: string; exp?: number; iss?: string; aud?: string } = {},
): string {
  const header = {
    alg: 'RS256',
    typ: 'JWT',
    kid: options.kid ?? 'loccoc-2026-01',
  };
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    sub: userId,
    role,
    sid: sessionId,
    iat: now,
    exp: options.exp ?? now + 900,
    iss: options.iss ?? 'loccoc-auth',
    aud: options.aud ?? 'loccoc-api',
  };

  const encode = (val: unknown) => Buffer.from(JSON.stringify(val)).toString('base64url');
  const input = `${encode(header)}.${encode(payload)}`;
  const signer = createSign('RSA-SHA256');
  signer.update(input);
  signer.end();
  return `${input}.${signer.sign(privateKey).toString('base64url')}`;
}

describe('Authorization & Anti-IDOR/BOLA (e2e)', () => {
  let app: INestApplication;
  let privateKey: string;

  const userAId = '11111111-1111-4111-8111-111111111111';
  const userBId = '22222222-2222-4222-8222-222222222222';
  const adminId = '99999999-9999-4999-8999-999999999999';
  const moderatorId = '88888888-8888-4888-8888-888888888888';

  const userASession = 'sess-user-a';
  const userBSession = 'sess-user-b';
  const revokedSession = 'sess-revoked';

  let userAToken: string;
  let _userBToken: string;
  let adminToken: string;
  let moderatorToken: string;
  let revokedToken: string;

  // In-memory mock database
  const mockUsers = new Map<string, User>();

  // In-memory mock Redis store
  const mockRedisStore = new Map<string, string>();
  const mockRedis = {
    get: async (key: string) => mockRedisStore.get(key) ?? null,
    set: async (key: string, val: string) => {
      mockRedisStore.set(key, val);
      return 'OK';
    },
  };

  const mockUsersRepository = {
    findById: async (id: string): Promise<User | null> => {
      const u = mockUsers.get(id);
      return u && !u.deletedAt ? u : null;
    },
    findByEmail: async (email: string): Promise<User | null> => {
      for (const u of mockUsers.values()) {
        if (u.email === email && !u.deletedAt) return u;
      }
      return null;
    },
    findAll: async (page = 1, limit = 20): Promise<[User[], number]> => {
      const active = Array.from(mockUsers.values()).filter((u) => !u.deletedAt);
      const start = (page - 1) * limit;
      return [active.slice(start, start + limit), active.length];
    },
    updateProfile: async (id: string, data: Partial<User>): Promise<User | null> => {
      const u = mockUsers.get(id);
      if (!u || u.deletedAt) return null;
      Object.assign(u, data, { updatedAt: new Date() });
      return u;
    },
    softDelete: async (id: string): Promise<boolean> => {
      const u = mockUsers.get(id);
      if (!u || u.deletedAt) return false;
      u.deletedAt = new Date();
      return true;
    },
  };

  beforeAll(() => {
    const keyPath = resolve(__dirname, '../../secrets/jwt-private.pem');
    privateKey = readFileSync(keyPath, 'utf8');

    userAToken = signTestToken(userAId, 'user', userASession, privateKey);
    _userBToken = signTestToken(userBId, 'user', userBSession, privateKey);
    adminToken = signTestToken(adminId, 'admin', 'sess-admin', privateKey);
    moderatorToken = signTestToken(moderatorId, 'moderator', 'sess-mod', privateKey);
    revokedToken = signTestToken(userAId, 'user', revokedSession, privateKey);

    // Mark revokedSession as revoked in Redis
    mockRedisStore.set(`auth:revoked:sid:${revokedSession}`, '1');
  });

  beforeEach(async () => {
    // Reset mock users
    mockUsers.clear();
    mockUsers.set(userAId, {
      id: userAId,
      email: 'usera@loccoc.vn',
      fullName: 'User A',
      avatarUrl: 'https://example.com/a.png',
      phone: '+84900000001',
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
    } as User);
    mockUsers.set(userBId, {
      id: userBId,
      email: 'userb@loccoc.vn',
      fullName: 'User B',
      avatarUrl: 'https://example.com/b.png',
      phone: '+84900000002',
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
    } as User);

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(UsersRepository)
      .useValue(mockUsersRepository)
      .overrideProvider(REDIS_CLIENT)
      .useValue(mockRedis)
      .compile();

    app = moduleFixture.createNestApplication();

    // Mirror production configuration from main.ts
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: { enableImplicitConversion: false },
      }),
    );
    app.useGlobalFilters(new ApiExceptionFilter());

    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  // ==========================================
  // 1. Authentication Check (401)
  // ==========================================
  describe('1. Authentication enforcement', () => {
    it('returns 401 when no token is provided', async () => {
      await request(app.getHttpServer())
        .get('/users/me')
        .expect(401);
    });

    it('returns 401 when token belongs to a logged out/revoked session', async () => {
      const res = await request(app.getHttpServer())
        .get('/users/me')
        .set('Authorization', `Bearer ${revokedToken}`)
        .expect(401);

      expect(res.body.message).toMatch(/revoked/i);
    });
  });

  // ==========================================
  // 2. IDOR / BOLA Prevention (404 instead of 403)
  // ==========================================
  describe('2. Anti-IDOR / Anti-BOLA checks', () => {
    it('returns 404 when User A alters ID in URL to read User B profile', async () => {
      // Must return 404, NOT 403, to avoid resource enumeration/existence leaking
      await request(app.getHttpServer())
        .get(`/users/${userBId}`)
        .set('Authorization', `Bearer ${userAToken}`)
        .expect(404);
    });

    it('returns 200 when User A reads own profile via /users/me', async () => {
      const res = await request(app.getHttpServer())
        .get('/users/me')
        .set('Authorization', `Bearer ${userAToken}`)
        .expect(200);

      expect(res.body.id).toBe(userAId);
      expect(res.body.email).toBe('usera@loccoc.vn');
    });

    it('returns 200 when User A reads own profile via /users/:id', async () => {
      const res = await request(app.getHttpServer())
        .get(`/users/${userAId}`)
        .set('Authorization', `Bearer ${userAToken}`)
        .expect(200);

      expect(res.body.id).toBe(userAId);
    });

    it('returns 200 when moderator reads User B profile (bypass roles)', async () => {
      const res = await request(app.getHttpServer())
        .get(`/users/${userBId}`)
        .set('Authorization', `Bearer ${moderatorToken}`)
        .expect(200);

      expect(res.body.id).toBe(userBId);
    });

    it('returns 200 when admin reads User B profile (bypass roles)', async () => {
      const res = await request(app.getHttpServer())
        .get(`/users/${userBId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.id).toBe(userBId);
    });
  });

  // ==========================================
  // 3. Role-Based Access Control (403)
  // ==========================================
  describe('3. Role privilege enforcement', () => {
    it('returns 403 when regular user calls admin-only list endpoint GET /users', async () => {
      await request(app.getHttpServer())
        .get('/users')
        .set('Authorization', `Bearer ${userAToken}`)
        .expect(403);
    });

    it('returns 403 when regular user calls admin-only PATCH /users/:id', async () => {
      await request(app.getHttpServer())
        .patch(`/users/${userBId}`)
        .set('Authorization', `Bearer ${userAToken}`)
        .send({ fullName: 'Malicious Update' })
        .expect(403);
    });

    it('returns 403 when regular user calls admin-only DELETE /users/:id', async () => {
      await request(app.getHttpServer())
        .delete(`/users/${userBId}`)
        .set('Authorization', `Bearer ${userAToken}`)
        .expect(403);
    });

    it('returns 200 when admin calls GET /users', async () => {
      const res = await request(app.getHttpServer())
        .get('/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.data).toHaveLength(2);
      expect(res.body.total).toBe(2);
    });

    it('returns 200 when admin updates User B via PATCH /users/:id', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/users/${userBId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ fullName: 'Admin Updated B' })
        .expect(200);

      expect(res.body.fullName).toBe('Admin Updated B');
    });
  });

  // ==========================================
  // 4. Mass Assignment Prevention (400)
  // ==========================================
  describe('4. Mass assignment protection', () => {
    it('returns 400 when client sends forbidden role field in PATCH /users/me body', async () => {
      const res = await request(app.getHttpServer())
        .patch('/users/me')
        .set('Authorization', `Bearer ${userAToken}`)
        .send({
          fullName: 'Attempted Escalation',
          role: 'admin',
        })
        .expect(400);

      expect(JSON.stringify(res.body)).toContain('property role should not exist');
    });

    it('returns 400 when client sends status/userId/ownerId in PATCH /users/me body', async () => {
      const res = await request(app.getHttpServer())
        .patch('/users/me')
        .set('Authorization', `Bearer ${userAToken}`)
        .send({
          status: 'active',
          userId: adminId,
          ownerId: adminId,
        })
        .expect(400);

      expect(JSON.stringify(res.body)).toContain('property status should not exist');
    });

    it('returns 200 when client updates only whitelisted fields in PATCH /users/me', async () => {
      const res = await request(app.getHttpServer())
        .patch('/users/me')
        .set('Authorization', `Bearer ${userAToken}`)
        .send({
          fullName: 'Valid Name Update',
          phone: '+84988888888',
        })
        .expect(200);

      expect(res.body.fullName).toBe('Valid Name Update');
      expect(res.body.phone).toBe('+84988888888');
    });
  });

  // ==========================================
  // 5. Account Deletion
  // ==========================================
  describe('5. Account deletion (self vs admin)', () => {
    it('allows User A to delete own account via DELETE /users/me', async () => {
      await request(app.getHttpServer())
        .delete('/users/me')
        .set('Authorization', `Bearer ${userAToken}`)
        .expect(200);

      expect(mockUsers.get(userAId)?.deletedAt).not.toBeNull();
    });

    it('allows Admin to delete User B via DELETE /users/:id', async () => {
      await request(app.getHttpServer())
        .delete(`/users/${userBId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(mockUsers.get(userBId)?.deletedAt).not.toBeNull();
    });
  });
});
