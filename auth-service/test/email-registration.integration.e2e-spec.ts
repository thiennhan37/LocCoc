import 'reflect-metadata';
import { readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { generateKeyPairSync, randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { Redis } from 'ioredis';
import { Kafka, logLevel, type Admin } from 'kafkajs';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AUTH_MIGRATIONS } from '../src/database/database.module.js';
import { Account } from '../src/auth/entities/account.entity.js';
import { Session } from '../src/auth/entities/session.entity.js';
import { RefreshToken } from '../src/auth/entities/refresh-token.entity.js';
import { AuthController } from '../src/auth/auth.controller.js';
import { AuthService } from '../src/auth/auth.service.js';
import { PasswordService } from '../src/auth/services/password.service.js';
import { TokenService } from '../src/auth/services/token.service.js';
import { KafkaOtpSender } from '../src/auth/services/kafka-otp.sender.js';
import { OtpService, RedisHashStore } from '../src/auth/services/otp.service.js';
import { Notifications1793318400001 } from '../../notification-service/src/migration.js';
import { EmailOtpJobs1794960000001 } from '../../notification-service/src/email-otp.migration.js';
import { EmailOtpRepository } from '../../notification-service/src/email-otp.repository.js';
import { EmailOtpWorker } from '../../notification-service/src/email-otp.worker.js';
import { BrevoEmailSender, EmailDeliveryError } from '../../notification-service/src/brevo-email.sender.js';
import { ServiceProxyController } from '../../api-gateway/src/service-proxy.controller.js';
import { configureGateway } from '../../api-gateway/src/bootstrap.js';
import { decryptEmailOtp, type EmailOtpPayload } from '@loccoc/common';

describe.skipIf(process.env.EMAIL_OTP_INTEGRATION !== '1')('email registration over real PostgreSQL / Redis / Kafka', () => {
  const suffix = randomUUID().replaceAll('-', '');
  const schema = `email_otp_test_${suffix}`;
  const topic = `test.email-otp.${suffix}`;
  const email = `registration-${suffix}@example.test`;
  const secret = 'isolated-integration-secret-12345678901234567890';
  let authDb: DataSource, notificationDb: DataSource, redis: Redis, admin: Admin;
  let app: INestApplication, gateway: INestApplication, publisher: KafkaOtpSender, worker: EmailOtpWorker, repo: EmailOtpRepository;
  const delivered: EmailOtpPayload[] = [];
  let failDelivery = true;
  let registrationId = '';

  const env = (path: string) => parseEnv(readFileSync(new URL(path, import.meta.url), 'utf8'));
  async function database(settings: Record<string, string>, prefix: string, migrations: DataSource['options']['migrations'], entities: DataSource['options']['entities'] = []) {
    const db = new DataSource({ type: 'postgres', host: settings.DB_HOST, port: Number(settings.DB_PORT || 5433),
      username: settings[`${prefix}_DB_USER`], password: settings[`${prefix}_DB_PASSWORD`], database: settings[`${prefix}_DB_NAME`],
      schema, entities, migrations, extra: { options: `-c search_path=${schema},public` } });
    await db.initialize();
    await db.query(`CREATE SCHEMA "${schema}"`);
    await db.runMigrations();
    return db;
  }
  beforeAll(async () => {
    const root = env('../../.env'), auth = { ...root, ...env('../.env') }, notification = { ...root, ...env('../../notification-service/.env') };
    authDb = await database(auth, 'AUTH', AUTH_MIGRATIONS, [Account, Session, RefreshToken]);
    notificationDb = await database(notification, 'NOTIFICATION', [Notifications1793318400001, EmailOtpJobs1794960000001]);
    redis = new Redis(auth.REDIS_URL, { keyPrefix: `${schema}:` });
    const brokers = (auth.KAFKA_BROKERS || '127.0.0.1:9092').split(',');
    admin = new Kafka({ clientId: 'email-otp-integration', brokers, logLevel: logLevel.NOTHING }).admin();
    await admin.connect();
    await admin.createTopics({ topics: [{ topic, numPartitions: 1, replicationFactor: 1 }], waitForLeaders: true });
    const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const config = new ConfigService({ NODE_ENV: 'test', OTP_EVENT_SECRET: secret, KAFKA_BROKERS: brokers.join(','),
      OTP_EVENTS_TOPIC: topic, OTP_CONSUMER_GROUP: `test-${suffix}`, JWT_PRIVATE_KEY: privateKey.export({ type: 'pkcs8', format: 'pem' }) });
    publisher = new KafkaOtpSender(authDb, config);
    const otps = new OtpService(new RedisHashStore(redis as unknown as ConstructorParameters<typeof RedisHashStore>[0]), publisher, config);
    const authService = new AuthService(authDb.getRepository(Account), authDb.getRepository(Session), authDb.getRepository(RefreshToken),
      new PasswordService(), otps, redis, config, new TokenService(config), authDb);
    const module = await Test.createTestingModule({ controllers: [AuthController], providers: [{ provide: AuthService, useValue: authService }] }).compile();
    app = module.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    await app.listen(0, '127.0.0.1');
    const gatewayModule = await Test.createTestingModule({ controllers: [ServiceProxyController], providers: [
      { provide: ConfigService, useValue: new ConfigService({ AUTH_SERVICE_URL: await app.getUrl(), CORS_ORIGINS: 'http://localhost:3000' }) },
    ] }).compile();
    gateway = gatewayModule.createNestApplication(); configureGateway(gateway); await gateway.init();
    repo = new EmailOtpRepository(notificationDb, { send: async (data: EmailOtpPayload) => {
      if (failDelivery) throw new EmailDeliveryError(true, 1);
      delivered.push(data);
    } } as unknown as BrevoEmailSender);
    worker = new EmailOtpWorker(config, repo);
    await worker.start(secret);
  }, 60_000);

  afterAll(async () => {
    await worker?.onModuleDestroy();
    await publisher?.onModuleDestroy();
    await gateway?.close(); await app?.close();
    if (admin) { await admin.deleteTopics({ topics: [topic] }); await admin.disconnect(); }
    if (redis) {
      const cleanup = redis.duplicate({ keyPrefix: '' });
      for await (const keys of cleanup.scanStream({ match: `${schema}:*`, count: 100 })) {
        if (keys.length) await cleanup.del(...keys);
      }
      await cleanup.quit();
      await redis.quit();
    }
    // Only generated, tightly scoped schemas can be dropped by this test.
    if (!/^email_otp_test_[a-f0-9]{32}$/.test(schema)) throw new Error('Unsafe test schema');
    for (const db of [authDb, notificationDb]) if (db?.isInitialized) {
      await db.query(`DROP SCHEMA "${schema}" CASCADE`); await db.destroy();
    }
  }, 30_000);

  it('queues encrypted mail, retries provider failure, deduplicates replay and activates exactly once through Gateway', async () => {
    const response = await request(gateway.getHttpServer()).post('/auth/register').send({ email, password: 'a safe integration passphrase' }).expect(201);
    registrationId = response.body.registrationId;
    expect(response.body).not.toHaveProperty('userId');
    await request(gateway.getHttpServer()).post('/auth/login').send({ email, password: 'a safe integration passphrase' }).expect(401);
    const [outbox] = await authDb.query('SELECT * FROM auth_email_outbox');
    expect(outbox.published_at).toBeNull(); // No broker connection was needed to accept registration.
    const payload = decryptEmailOtp(outbox.event, secret);
    expect(JSON.stringify(outbox)).not.toContain(email);
    expect(JSON.stringify(outbox)).not.toContain(payload.code);
    await publisher.flush();
    const deadline = Date.now() + 15_000;
    while (!(await notificationDb.query('SELECT event_id FROM email_otp_jobs')).length && Date.now() < deadline) {
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    expect(await notificationDb.query('SELECT event_id FROM email_otp_jobs')).toHaveLength(1);
    await repo.deliver(secret);
    expect(delivered).toHaveLength(0);
    const [failed] = await notificationDb.query('SELECT * FROM email_otp_jobs');
    expect(failed.attempts).toBe(1); expect(failed.finished_at).toBeNull();
    failDelivery = false;
    await notificationDb.query('UPDATE email_otp_jobs SET next_attempt_at=now()');
    await Promise.all([repo.deliver(secret), repo.deliver(secret)]);
    expect(delivered).toHaveLength(1);
    expect(delivered[0]).toEqual(payload);
    // Crash replay of a published event must not cause another mail.
    await authDb.query('UPDATE auth_email_outbox SET published_at=NULL'); await publisher.flush();
    await repo.ingest(outbox.event); await repo.deliver(secret);
    expect(delivered).toHaveLength(1);
    const result = await Promise.all(Array.from({ length: 8 }, () => request(gateway.getHttpServer()).post('/auth/verify-otp')
      .send({ email, registrationId, otp: payload.code })));
    expect(result.filter(r => r.body.verified === true)).toHaveLength(1);
    const login = await request(gateway.getHttpServer()).post('/auth/login').send({ email, password: 'a safe integration passphrase' }).expect(200);
    expect(login.body.authenticated).toBe(true); expect(login.body.accessToken).toMatch(/^[\w-]+\.[\w-]+\.[\w-]+$/);
    expect(login.body.refreshToken).toBeTypeOf('string');
  }, 30_000);

  it('serializes rate reservations across real Redis callers', async () => {
    const store = new RedisHashStore(redis as unknown as ConstructorParameters<typeof RedisHashStore>[0]);
    const results = await Promise.all(Array.from({ length: 20 }, () => store.reserve('test:rate:destination', 'test:rate:ip', Date.now())));
    expect(results.filter(value => value === 0)).toHaveLength(1);
    expect(results.filter(value => value > 0)).toHaveLength(19);
  });

  it('applies the verified registration password rather than an earlier unverified password', async () => {
    const address = `pending-${suffix}@example.test`;
    const earlier = await request(gateway.getHttpServer()).post('/auth/register').send({ email: address, password: 'earlier unverified password' }).expect(201);
    // Only this isolated Redis namespace is changed to simulate passing its cooldown.
    await redis.del(`auth:otp:resend:${address}`);
    const owner = await request(gateway.getHttpServer()).post('/auth/register').send({ email: address, password: 'verified owners passphrase' }).expect(201);
    const events = await authDb.query('SELECT event FROM auth_email_outbox WHERE registration_id IN ($1,$2)', [earlier.body.registrationId, owner.body.registrationId]);
    const codes = events.map((row: { event: Parameters<typeof decryptEmailOtp>[0] }) => decryptEmailOtp(row.event, secret));
    const ownersCode = codes.find((value: EmailOtpPayload) => value.registrationId === owner.body.registrationId)!;
    const earlierCode = codes.find((value: EmailOtpPayload) => value.registrationId === earlier.body.registrationId)!;
    const activated = await request(gateway.getHttpServer()).post('/auth/verify-otp').send({ email: address, registrationId: owner.body.registrationId, otp: ownersCode.code }).expect(200);
    expect(activated.body.verified).toBe(true);
    await request(gateway.getHttpServer()).post('/auth/login').send({ email: address, password: 'verified owners passphrase' }).expect(200);
    await request(gateway.getHttpServer()).post('/auth/login').send({ email: address, password: 'earlier unverified password' }).expect(401);
    const stale = await request(gateway.getHttpServer()).post('/auth/verify-otp').send({ email: address, registrationId: earlier.body.registrationId, otp: earlierCode.code }).expect(200);
    expect(stale.body.verified).toBe(false);
    await request(gateway.getHttpServer()).post('/auth/login').send({ email: address, password: 'verified owners passphrase' }).expect(200);
  }, 15_000);
});
