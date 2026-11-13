import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { SocialOutboxPublisher } from '../src/social/social-outbox.publisher.js';

const kafka = vi.hoisted(() => ({
  send: vi.fn(),
  connect: vi.fn(),
  disconnect: vi.fn(),
}));
vi.mock('kafkajs', () => ({
  Kafka: class {
    producer() {
      return kafka;
    }
  },
  Partitioners: { DefaultPartitioner: vi.fn() },
}));

const url = process.env.OUTBOX_TEST_DB_URL;
describe.skipIf(!url)(
  'social outbox batching on PostgreSQL (mocked Kafka)',
  () => {
    let db: DataSource;
    let publisher: SocialOutboxPublisher;
    const schema = `outbox_test_${randomUUID().replaceAll('-', '')}`;
    // This suite expects a disposable database. It creates no project tables.
    beforeAll(async () => {
      db = new DataSource({
        type: 'postgres',
        url,
        extra: { options: `-c search_path=${schema}` },
      });
      await db.initialize();
      await db.query(`CREATE SCHEMA "${schema}"`);
      await db.query(`CREATE TABLE social_outbox (
      id uuid PRIMARY KEY, aggregate_id uuid NOT NULL, payload jsonb NOT NULL,
      created_at timestamptz NOT NULL DEFAULT clock_timestamp(), published_at timestamptz
    )`);
    });
    beforeEach(async () => {
      await db.query('DROP TRIGGER IF EXISTS fail_update ON social_outbox');
      await db.query('DROP TRIGGER IF EXISTS fail_delete ON social_outbox');
      await db.query('TRUNCATE social_outbox');
      kafka.send.mockReset().mockResolvedValue([]);
      kafka.connect.mockReset().mockResolvedValue(undefined);
      kafka.disconnect.mockReset().mockResolvedValue(undefined);
      publisher = new SocialOutboxPublisher(
        new ConfigService({ NODE_ENV: 'test' }),
        db,
      );
    });
    afterAll(async () => {
      await publisher?.onModuleDestroy();
      if (db?.isInitialized) await db.query(`DROP SCHEMA "${schema}" CASCADE`);
      await db?.destroy();
    });
    async function seed(count: number) {
      const ids: string[] = [];
      for (let i = 0; i < count; i++) {
        const id = randomUUID();
        ids.push(id);
        await db.query(
          `INSERT INTO social_outbox(id,aggregate_id,payload,created_at)
        VALUES($1,$2,$3,now()+$4*interval '1 second')`,
          [id, randomUUID(), { eventId: id }, i],
        );
      }
      return ids;
    }
    async function published() {
      return (
        await db.query(
          'SELECT id FROM social_outbox WHERE published_at IS NOT NULL',
        )
      ).map((r: { id: string }) => r.id);
    }
    it('publishes only the selected 20 rows and drains the remaining row next time', async () => {
      const ids = await seed(21);
      await publisher.flush();
      expect(kafka.send).toHaveBeenCalledTimes(1);
      expect(kafka.send.mock.calls[0]![0].messages).toHaveLength(20);
      expect((await published()).sort()).toEqual(ids.slice(0, 20).sort());
      await publisher.flush();
      expect(kafka.send.mock.calls[1]![0].messages).toHaveLength(1);
      expect(await published()).toHaveLength(21);
      await publisher.flush();
      expect(kafka.send).toHaveBeenCalledTimes(2);
    });
    it('leaves every row pending after Kafka failure and retries the same batch', async () => {
      await seed(20);
      kafka.send.mockRejectedValueOnce(new Error('Kafka unavailable'));
      await expect(publisher.flush()).rejects.toThrow('Kafka unavailable');
      expect(await published()).toHaveLength(0);
      await publisher.flush();
      expect(await published()).toHaveLength(20);
      expect(kafka.send.mock.calls[0]).toEqual(kafka.send.mock.calls[1]);
    });
    it('rolls back a failed bulk update after Kafka acknowledgment and safely retries', async () => {
      await seed(20);
      await db.query(`CREATE OR REPLACE FUNCTION fail_outbox_test() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'forced DB failure'; END $$`);
      await db.query(`CREATE TRIGGER fail_update BEFORE UPDATE ON social_outbox
      FOR EACH ROW EXECUTE FUNCTION fail_outbox_test()`);
      await expect(publisher.flush()).rejects.toThrow('forced DB failure');
      expect(await published()).toHaveLength(0);
      await db.query('DROP TRIGGER fail_update ON social_outbox');
      await publisher.flush();
      expect(await published()).toHaveLength(20);
      expect(kafka.send.mock.calls[0]).toEqual(kafka.send.mock.calls[1]);
    });
    it('deletes at most 500 old published rows, preserving recent and pending rows', async () => {
      await db.query(`INSERT INTO social_outbox(id,aggregate_id,payload,created_at,published_at)
      SELECT gen_random_uuid(),gen_random_uuid(),'{}',now()-interval '9 days',now()-interval '8 days'
      FROM generate_series(1,501)`);
      const [pending, recent] = await seed(2);
      await db.query(
        "UPDATE social_outbox SET created_at=now()-interval '9 days' WHERE id=$1",
        [pending],
      );
      await db.query(
        'UPDATE social_outbox SET published_at=now() WHERE id=$1',
        [recent],
      );
      await publisher.cleanup();
      expect(
        (await db.query('SELECT count(*)::int AS n FROM social_outbox'))[0].n,
      ).toBe(3);
      await publisher.cleanup();
      const remaining = await db.query('SELECT id FROM social_outbox');
      expect(remaining.map((r: { id: string }) => r.id).sort()).toEqual(
        [pending, recent].sort(),
      );
      expect(kafka.send).not.toHaveBeenCalled();
    });
    it('cleanup SQL failure cannot undo published rows or prevent later publishing', async () => {
      const [old] = await seed(1);
      await publisher.flush();
      await db.query(
        "UPDATE social_outbox SET published_at=now()-interval '8 days' WHERE id=$1",
        [old],
      );
      await db.query(`CREATE OR REPLACE FUNCTION fail_outbox_test() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'forced DB failure'; END $$`);
      await db.query(`CREATE TRIGGER fail_delete BEFORE DELETE ON social_outbox
      FOR EACH ROW EXECUTE FUNCTION fail_outbox_test()`);
      await expect(publisher.cleanup()).rejects.toThrow('forced DB failure');
      expect(await published()).toEqual([old]);
      await seed(1);
      await publisher.flush();
      expect(await published()).toHaveLength(2);
      await db.query('DROP TRIGGER fail_delete ON social_outbox');
      await publisher.cleanup();
      expect(await published()).toHaveLength(1);
    });
  },
);
