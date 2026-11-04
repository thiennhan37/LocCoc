import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { randomUUID } from 'node:crypto';
import { beforeAll, beforeEach, afterAll, describe, it, expect } from 'vitest';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AccountAccessService } from '../../auth-service/src/auth/account-access.service.js';
import {
  InternalAccountsController,
  InternalServiceGuard,
} from '../../auth-service/src/auth/internal-accounts.controller.js';
import { CreateAccounts1710000000000 } from '../../auth-service/src/database/migrations/1710000000000-CreateAccounts.js';
import { CreateSessions1710000001000 } from '../../auth-service/src/database/migrations/1710000001000-CreateSessions.js';
const url = process.env.NOTIFICATION_TEST_DB_URL;
describe.skipIf(!url)('push session authority on real auth schema', () => {
  const schema = 'push_auth_' + randomUUID().replaceAll('-', ''),
    user = randomUUID(),
    session = randomUUID();
  let admin: DataSource, db: DataSource, service: AccountAccessService;
  const token = 'test-service-credential-12345678901234567890';
  const config = new ConfigService({ INTERNAL_SERVICE_TOKEN: token });
  beforeAll(async () => {
    admin = await new DataSource({ type: 'postgres', url }).initialize();
    await admin.query(`CREATE SCHEMA ${schema}`);
    db = await new DataSource({
      type: 'postgres',
      url,
      extra: { options: `-c search_path=${schema},public` },
    }).initialize();
    const q = db.createQueryRunner();
    await new CreateAccounts1710000000000().up(q);
    await new CreateSessions1710000001000().up(q);
    await q.release();
    service = new AccountAccessService(db, config, {} as never);
  });
  beforeEach(async () => {
    await db.query('TRUNCATE accounts CASCADE');
    await db.query(
      "INSERT INTO accounts(id,email,password_hash,status) VALUES($1,'push@test.invalid','hash','active')",
      [user],
    );
    await db.query(
      "INSERT INTO sessions(id,user_id,refresh_token_hash,expires_at) VALUES($1,$2,$3,now()+interval '1 hour')",
      [session, user, 'a'.repeat(64)],
    );
  });
  afterAll(async () => {
    await db?.destroy();
    await admin?.query(`DROP SCHEMA ${schema} CASCADE`);
    await admin?.destroy();
  });
  it('allows a live session belonging to the active recipient', async () => {
    expect(await service.pushSession(user, session)).toEqual({ allowed: true });
    expect(await service.pushSession(randomUUID(), session)).toEqual({
      allowed: false,
    });
  });
  it.each([
    'UPDATE sessions SET revoked_at=now()',
    "UPDATE sessions SET expires_at=now()-interval '1 second'",
    "UPDATE accounts SET status='suspended'",
    'UPDATE accounts SET deleted_at=now()',
  ])('denies after %s', async (sql) => {
    await db.query(sql);
    expect(await service.pushSession(user, session)).toEqual({
      allowed: false,
    });
  });
  it('requires service credentials and exposes no public user data', async () => {
    const m = await Test.createTestingModule({
      controllers: [InternalAccountsController],
      providers: [
        InternalServiceGuard,
        { provide: ConfigService, useValue: config },
        { provide: AccountAccessService, useValue: service },
      ],
    }).compile();
    const app = m.createNestApplication();
    await app.init();
    try {
      const path = `/internal/push-sessions/${user}/${session}`;
      await request(app.getHttpServer()).get(path).expect(401);
      const r = await request(app.getHttpServer())
        .get(path)
        .set('x-service-token', token)
        .expect(200);
      expect(r.body).toEqual({ allowed: true });
    } finally {
      await app.close();
    }
  });
});
