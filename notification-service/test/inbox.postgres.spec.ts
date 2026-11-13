import 'reflect-metadata';
import {
  beforeAll,
  afterAll,
  beforeEach,
  describe,
  it,
  expect,
  vi,
} from 'vitest';
import { DataSource } from 'typeorm';
import { Kafka, logLevel } from 'kafkajs';
import { randomUUID } from 'node:crypto';
import { Test } from '@nestjs/testing';
import { APP_GUARD } from '@nestjs/core';
import { AccountAccessGuard, AccountAuthorityClient } from '@loccoc/common';
import { ValidationPipe, UnauthorizedException } from '@nestjs/common';
import request from 'supertest';
import { NotificationsController } from '../src/notifications.controller.js';
import { NotificationsService } from '../src/notifications.service.js';
import { ConfigService } from '@nestjs/config';
import { Notifications1793318400001 } from '../src/migration.js';
import { NotificationsRepository } from '../src/notifications.repository.js';
import { CursorCodec } from '../src/cursor.js';
import { parseEvent, type SocialEvent } from '../src/event.js';
import { CreateUsersTable1710000000000 } from '../../user-service/src/database/migrations/1710000000000-CreateUsersTable.js';
import { UserSocial1793145600000 } from '../../user-service/src/database/migrations/1793145600000-UserSocial.js';
import { SocialOutbox1793318400000 } from '../../user-service/src/database/migrations/1793318400000-SocialOutbox.js';
import { SocialRepository } from '../../user-service/src/social/social.repository.js';
import { SocialOutboxPublisher } from '../../user-service/src/social/social-outbox.publisher.js';
import { NotificationWorkers } from '../src/workers.js';
const pushSend = vi.hoisted(() =>
  vi.fn().mockResolvedValue('provider-message-id'),
);
vi.mock('firebase-admin/messaging', () => ({
  getMessaging: () => ({ send: pushSend }),
}));
const url = process.env.NOTIFICATION_TEST_DB_URL;
describe.skipIf(!url)('notification PostgreSQL correctness', () => {
  let db: DataSource, repo: NotificationsRepository, codec: CursorCodec;
  const user = randomUUID(),
    actor = randomUUID(),
    stranger = randomUUID(),
    session = randomUUID(),
    installation = randomUUID();
  function event(): SocialEvent {
    const id = randomUUID();
    return {
      eventId: randomUUID(),
      eventType: 'FRIEND_REQUEST_RECEIVED',
      aggregateId: id,
      timestamp: new Date().toISOString(),
      version: 1,
      data: {
        recipientId: user,
        friendRequestId: id,
        actor: { id: actor, displayName: 'Minh', avatarUrl: null },
      },
    };
  }
  beforeAll(async () => {
    db = new DataSource({
      type: 'postgres',
      url,
      migrations: [
        Notifications1793318400001,
        CreateUsersTable1710000000000,
        UserSocial1793145600000,
        SocialOutbox1793318400000,
      ],
    });
    await db.initialize();
    await db.runMigrations();
    codec = new CursorCodec(
      new ConfigService({
        NOTIFICATION_CURSOR_SECRET: 'isolated-test-key-12345678901234567890',
      }),
    );
    repo = new NotificationsRepository(db, codec);
  });
  afterAll(async () => {
    await db?.destroy();
  });
  beforeEach(async () => {
    pushSend.mockReset().mockResolvedValue('provider-message-id');
    await db.query(
      'TRUNCATE notification_quarantine,notifications,inbox_state,notification_dedupe,push_devices,push_jobs,social_outbox,friend_requests,friendships,user_blocks,users CASCADE',
    );
  });
  it('keeps arrivals between list and seen new; old device cannot rewind', async () => {
    await repo.ingest(event());
    const a = await repo.list(user, 20);
    await repo.ingest(event());
    expect(await repo.seen(user, a.seenCursor!)).toEqual({
      unseenCount: 1,
      unreadCount: 2,
    });
    const b = await repo.list(user, 20);
    await repo.seen(user, b.seenCursor!);
    await repo.seen(user, a.seenCursor!);
    expect(await repo.counts(user)).toEqual({ unseenCount: 0, unreadCount: 2 });
  });
  it('counts actual unread/unexpired rows, not sequence difference', async () => {
    for (let i = 0; i < 5; i++) await repo.ingest(event());
    const list = await repo.list(user, 20);
    await repo.read(user, list.items[0].id);
    await db.query(
      "UPDATE notifications SET expires_at=now()-interval '1 second' WHERE id=$1",
      [list.items[1].id],
    );
    expect(await repo.counts(user)).toEqual({ unseenCount: 3, unreadCount: 3 });
  });
  it('deduplicates concurrent redelivery and saves exactly one push job', async () => {
    await repo.register(
      user,
      session,
      installation,
      'a-test-token-with-enough-length',
      'android',
    );
    const e = event();
    await Promise.all(Array.from({ length: 8 }, () => repo.ingest(e)));
    expect((await repo.list(user, 20)).items).toHaveLength(1);
    expect(
      (await db.query('SELECT count(*)::int AS n FROM push_jobs'))[0].n,
    ).toBe(1);
    expect(
      (await db.query('SELECT latest_sequence FROM inbox_state'))[0]
        .latest_sequence,
    ).toBe('1');
  });
  it('serializes distinct concurrent arrivals without losing unseen rows', async () => {
    await Promise.all(Array.from({ length: 10 }, () => repo.ingest(event())));
    const first = await repo.list(user, 3);
    await repo.seen(user, first.seenCursor!);
    await repo.ingest(event());
    expect(await repo.counts(user)).toEqual({
      unseenCount: 1,
      unreadCount: 11,
    });
  });
  it('read is idempotent, owned and does not advance other notifications', async () => {
    await repo.ingest(event());
    await repo.ingest(event());
    const n = (await repo.list(user, 20)).items[0];
    const first = await repo.read(user, n.id);
    expect(await repo.read(user, n.id)).toEqual(first);
    await expect(repo.read(stranger, n.id)).rejects.toMatchObject({
      status: 404,
    });
    await expect(repo.read(user, randomUUID())).rejects.toMatchObject({
      status: 404,
    });
    expect(await repo.counts(user)).toEqual({ unseenCount: 1, unreadCount: 1 });
  });
  it('scopes signed cursors by user/purpose and rejects tampering', async () => {
    const first = await repo.list(user, 20);
    await expect(repo.seen(stranger, first.seenCursor!)).rejects.toMatchObject({
      status: 400,
    });
    await expect(
      repo.seen(user, first.seenCursor! + 'x'),
    ).rejects.toMatchObject({ status: 400 });
    await expect(repo.list(user, 20, first.seenCursor!)).rejects.toMatchObject({
      status: 400,
    });
  });
  it('paginates timestamp ties without duplicates while new notifications arrive', async () => {
    for (let i = 0; i < 5; i++) await repo.ingest(event());
    await db.query(
      "UPDATE notifications SET created_at='2026-10-01 00:00:00.123456+00'",
    );
    const a = await repo.list(user, 2);
    await repo.ingest(event());
    const b = await repo.list(user, 2, a.pageInfo.nextCursor!);
    const c = await repo.list(user, 2, b.pageInfo.nextCursor!);
    expect(
      new Set([...a.items, ...b.items, ...c.items].map((n) => n.id)).size,
    ).toBe(5);
    expect(c.pageInfo.hasMore).toBe(false);
  });
  it('atomically rolls back marker, notification and dedupe if push-job insert fails', async () => {
    await repo.register(
      user,
      session,
      installation,
      'a-test-token-with-enough-length',
      'android',
    );
    await db.query(
      "CREATE FUNCTION reject_push_test() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test failure'; END $$; CREATE TRIGGER reject_push_test BEFORE INSERT ON push_jobs FOR EACH ROW EXECUTE FUNCTION reject_push_test()",
    );
    try {
      await expect(repo.ingest(event())).rejects.toThrow('test failure');
      expect(
        (await db.query('SELECT count(*)::int n FROM notifications'))[0].n,
      ).toBe(0);
      expect(
        (await db.query('SELECT count(*)::int n FROM notification_dedupe'))[0]
          .n,
      ).toBe(0);
    } finally {
      await db.query(
        'DROP TRIGGER reject_push_test ON push_jobs; DROP FUNCTION reject_push_test()',
      );
    }
  });
  it('expires list/count and skips historical replay after retention', async () => {
    const e = event();
    e.timestamp = new Date(Date.now() - 91 * 86400000).toISOString();
    await repo.ingest(e);
    expect((await repo.list(user, 20)).items).toHaveLength(0);
    await repo.ingest(event());
    await db.query(
      "UPDATE notifications SET expires_at=now()-interval '1 second'",
    );
    expect(await repo.counts(user)).toEqual({ unseenCount: 0, unreadCount: 0 });
    await repo.cleanup();
    expect((await repo.list(user, 20)).items).toHaveLength(0);
  });
  it('creates source outbox atomically for send/accept, not cancellation', async () => {
    const social = new SocialRepository(db);
    for (const id of [user, actor])
      await db.query(
        "INSERT INTO users(id,email,username,account_status) VALUES($1,$2,$3,'active')",
        [id, id + '@test.invalid', id === user ? 'receiver' : 'sender'],
      );
    const r = await social.send(actor, user);
    let rows = await db.query('SELECT payload FROM social_outbox');
    expect(parseEvent(rows[0].payload).data.recipientId).toBe(user);
    await social.resolve(user, r.id, 'ACCEPTED');
    rows = await db.query(
      'SELECT payload FROM social_outbox ORDER BY created_at',
    );
    expect(
      rows.map((r: { payload: SocialEvent }) => r.payload.eventType),
    ).toEqual(['FRIEND_REQUEST_RECEIVED', 'FRIEND_REQUEST_ACCEPTED']);
    expect(rows[1].payload.data.recipientId).toBe(actor);
    await db.query('BEGIN');
    await db.query(
      'INSERT INTO friend_requests(sender_id,receiver_id) VALUES($1,$2)',
      [user, actor],
    );
    await db.query('ROLLBACK');
    expect(
      (await db.query('SELECT count(*)::int n FROM social_outbox'))[0].n,
    ).toBe(2);
  });
  it('retries durable push jobs on authority/network failure without exposing tokens', async () => {
    await repo.register(
      user,
      session,
      installation,
      'a-test-token-with-enough-length',
      'android',
    );
    await repo.ingest(event());
    const worker = new NotificationWorkers(
      db,
      new ConfigService({ NODE_ENV: 'test' }),
      repo,
      { call: vi.fn().mockRejectedValue(new Error('offline')) } as never,
    );
    await worker.deliver();
    const [job] = await db.query(
      'SELECT attempts,finished_at,next_attempt_at>now() delayed FROM push_jobs',
    );
    expect(job).toMatchObject({
      attempts: 1,
      finished_at: null,
      delayed: true,
    });
  });
  it('does not send old-session jobs after installation changes account', async () => {
    await repo.register(
      user,
      session,
      installation,
      'a-test-token-with-enough-length',
      'android',
    );
    await repo.ingest(event());
    await repo.register(
      stranger,
      randomUUID(),
      installation,
      'new-test-token-with-enough-length',
      'android',
    );
    const authority = { call: vi.fn() };
    const worker = new NotificationWorkers(
      db,
      new ConfigService({ NODE_ENV: 'test' }),
      repo,
      authority as never,
    );
    await worker.deliver();
    expect(authority.call).not.toHaveBeenCalled();
    expect(
      (await db.query('SELECT finished_at FROM push_jobs'))[0].finished_at,
    ).not.toBeNull();
  });
  it.skipIf(!process.env.NOTIFICATION_TEST_KAFKA_BROKERS)(
    'delivers transactional outbox through real Kafka and safely replays',
    async () => {
      const topic = 'notification-verification-' + randomUUID();
      const brokers = process.env.NOTIFICATION_TEST_KAFKA_BROKERS!;
      const kafka = new Kafka({
        clientId: 'notification-test',
        brokers: brokers.split(','),
        logLevel: logLevel.NOTHING,
      });
      const admin = kafka.admin();
      await admin.connect();
      await admin.createTopics({
        topics: [{ topic, numPartitions: 1, replicationFactor: 1 }],
        waitForLeaders: true,
      });
      const config = new ConfigService({
        NODE_ENV: 'test',
        KAFKA_BROKERS: brokers,
        SOCIAL_EVENTS_TOPIC: topic,
        NOTIFICATION_CONSUMER_GROUP: topic,
      });
      const publisher = new SocialOutboxPublisher(config, db);
      const consumer = new NotificationWorkers(db, config, repo, {} as never);
      try {
        for (const id of [user, actor])
          await db.query(
            "INSERT INTO users(id,email,username,account_status) VALUES($1,$2,$3,'active')",
            [id, id + '@test.invalid', id === user ? 'receiver' : 'sender'],
          );
        const social = new SocialRepository(db);
        await social.send(actor, user);
        expect((await repo.list(user, 20)).items).toHaveLength(0);
        await consumer.start();
        await publisher.flush();
        const wait = async () => {
          for (let i = 0; i < 50; i++) {
            if ((await repo.list(user, 20)).items.length === 1) return;
            await new Promise((r) => setTimeout(r, 100));
          }
          throw Error('Kafka delivery timed out');
        };
        await wait();
        await db.query('UPDATE social_outbox SET published_at=NULL');
        await publisher.flush();
        await new Promise((r) => setTimeout(r, 400));
        expect((await repo.list(user, 20)).items).toHaveLength(1);
        const producer = kafka.producer();
        await producer.connect();
        try {
          await producer.send({ topic, messages: [{ value: 'invalid-json' }] });
        } finally {
          await producer.disconnect();
        }
        for (let i = 0; i < 50; i++) {
          if (
            (
              await db.query(
                'SELECT count(*)::int n FROM notification_quarantine',
              )
            )[0].n > 0
          )
            break;
          await new Promise((r) => setTimeout(r, 100));
        }
        expect(
          (
            await db.query(
              'SELECT count(*)::int n FROM notification_quarantine',
            )
          )[0].n,
        ).toBe(1);
      } finally {
        await consumer.onModuleDestroy();
        await publisher.onModuleDestroy();
        await admin.deleteTopics({ topics: [topic] });
        await admin.disconnect();
      }
    },
    30000,
  );
  it('enforces authentication, ownership and DTO validation at HTTP boundary', async () => {
    const authority = {
      access: async (token: string) => {
        if (token !== 'Bearer valid') throw new UnauthorizedException();
        return { user: { userId: user, sessionId: session } };
      },
    };
    const module = await Test.createTestingModule({
      controllers: [NotificationsController],
      providers: [
        {
          provide: NotificationsService,
          useValue: new NotificationsService(repo),
        },
        { provide: AccountAuthorityClient, useValue: authority },
        { provide: APP_GUARD, useClass: AccountAccessGuard },
      ],
    }).compile();
    const app = module.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    );
    await app.init();
    try {
      await request(app.getHttpServer()).get('/notifications').expect(401);
      await request(app.getHttpServer())
        .get('/notifications?limit=101')
        .set('authorization', 'Bearer valid')
        .expect(400);
      const foreign = event();
      foreign.data.recipientId = stranger;
      await repo.ingest(foreign);
      const row = (await repo.list(stranger, 20)).items[0];
      await request(app.getHttpServer())
        .patch(`/notifications/${row.id}/read`)
        .set('authorization', 'Bearer valid')
        .set('x-user-id', stranger)
        .expect(404);
      await request(app.getHttpServer())
        .patch('/notifications/seen')
        .set('authorization', 'Bearer valid')
        .send({ seenCursor: 'invalid', recipientId: stranger })
        .expect(400);
      const first = await request(app.getHttpServer())
        .get('/notifications')
        .set('authorization', 'Bearer valid')
        .expect(200);
      expect(first.body.items).toHaveLength(0);
    } finally {
      await app.close();
    }
  });
  it('sends bounded-TTL push with notificationId and marks the durable job complete', async () => {
    await repo.register(
      user,
      session,
      installation,
      'a-test-token-with-enough-length',
      'android',
    );
    await repo.ingest(event());
    const authority = { call: vi.fn().mockResolvedValue({ allowed: true }) };
    const worker = new NotificationWorkers(
      db,
      new ConfigService({ NODE_ENV: 'test' }),
      repo,
      authority as never,
    );
    await worker.deliver();
    expect(pushSend).toHaveBeenCalledTimes(1);
    const message = pushSend.mock.calls[0][0];
    expect(message.data.recipientId).toBe(user);
    expect(message.data.notificationId).toBeTruthy();
    expect(message.android.ttl).toBeGreaterThan(0);
    expect(message.android.ttl).toBeLessThanOrEqual(86400000);
    expect(
      (await db.query('SELECT finished_at FROM push_jobs'))[0].finished_at,
    ).not.toBeNull();
    await worker.deliver();
    expect(pushSend).toHaveBeenCalledTimes(1);
  });
  it('revoked/suspended sessions deactivate their push registration', async () => {
    await repo.register(
      user,
      session,
      installation,
      'a-test-token-with-enough-length',
      'android',
    );
    await repo.ingest(event());
    const worker = new NotificationWorkers(
      db,
      new ConfigService({ NODE_ENV: 'test' }),
      repo,
      { call: vi.fn().mockResolvedValue({ allowed: false }) } as never,
    );
    await worker.deliver();
    expect(pushSend).not.toHaveBeenCalled();
    expect(
      (await db.query('SELECT count(*)::int n FROM push_devices'))[0].n,
    ).toBe(0);
  });
  it('invalid FCM registration is removed instead of repeatedly retried', async () => {
    await repo.register(
      user,
      session,
      installation,
      'a-test-token-with-enough-length',
      'android',
    );
    await repo.ingest(event());
    pushSend.mockRejectedValueOnce({
      code: 'messaging/registration-token-not-registered',
    });
    const worker = new NotificationWorkers(
      db,
      new ConfigService({ NODE_ENV: 'test' }),
      repo,
      { call: vi.fn().mockResolvedValue({ allowed: true }) } as never,
    );
    await worker.deliver();
    expect(
      (await db.query('SELECT count(*)::int n FROM push_devices'))[0].n,
    ).toBe(0);
    expect(
      (await db.query('SELECT finished_at FROM push_jobs'))[0].finished_at,
    ).not.toBeNull();
  });
});
