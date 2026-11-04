import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';
import type { DataSource } from 'typeorm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SocialOutboxPublisher } from './social-outbox.publisher.js';

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

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe('SocialOutboxPublisher', () => {
  const rows = Array.from({ length: 20 }, (_, i) => ({
    id: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
    aggregate_id: `request-${i % 2}`,
    payload: { eventId: `event-${i}`, version: 1 },
  }));
  let publisher: SocialOutboxPublisher;
  let query: ReturnType<typeof vi.fn>;
  let cleanupQuery: ReturnType<typeof vi.fn>;
  let config: ConfigService;
  let warn: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    kafka.send.mockReset().mockResolvedValue([]);
    kafka.connect.mockReset().mockResolvedValue(undefined);
    kafka.disconnect.mockReset().mockResolvedValue(undefined);
    query = vi
      .fn()
      .mockImplementation(async (sql: string) =>
        sql.startsWith('SELECT') ? rows : [],
      );
    cleanupQuery = vi.fn().mockResolvedValue([]);
    config = new ConfigService({
      NODE_ENV: 'test',
      SOCIAL_EVENTS_TOPIC: 'test-social',
    });
    publisher = new SocialOutboxPublisher(config, {
      transaction: async (
        work: (m: { query: typeof query }) => Promise<void>,
      ) => work({ query }),
      query: cleanupQuery,
    } as unknown as DataSource);
    warn = vi
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
  });
  afterEach(async () => {
    await publisher.onModuleDestroy();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('sends 20 ordered messages in one batch and marks exactly those IDs after acknowledgment', async () => {
    const ack = deferred();
    kafka.send.mockReturnValueOnce(ack.promise);
    const work = publisher.flush();
    await vi.waitFor(() => expect(kafka.send).toHaveBeenCalledTimes(1));
    expect(query).toHaveBeenCalledTimes(1);
    expect(kafka.send).toHaveBeenCalledWith({
      topic: 'test-social',
      messages: rows.map((e) => ({
        key: e.aggregate_id,
        value: JSON.stringify(e.payload),
      })),
    });
    ack.resolve();
    await work;
    expect(query).toHaveBeenCalledTimes(2);
    expect(query).toHaveBeenLastCalledWith(
      'UPDATE social_outbox SET published_at=now() WHERE id=ANY($1::uuid[])',
      [rows.map((e) => e.id)],
    );
    expect(cleanupQuery).not.toHaveBeenCalled();
  });

  it('does not send or update an empty batch', async () => {
    query.mockResolvedValue([]);
    await publisher.flush();
    expect(kafka.send).not.toHaveBeenCalled();
    expect(query).toHaveBeenCalledTimes(1);
    expect(cleanupQuery).not.toHaveBeenCalled();
  });

  it('does not mark failed sends and can retry the same event IDs', async () => {
    kafka.send.mockRejectedValueOnce(new Error('Kafka unavailable'));
    await expect(publisher.flush()).rejects.toThrow('Kafka unavailable');
    expect(query).toHaveBeenCalledTimes(1);
    await publisher.flush();
    expect(kafka.send).toHaveBeenCalledTimes(2);
    expect(kafka.send.mock.calls[0]).toEqual(kafka.send.mock.calls[1]);
    expect(query).toHaveBeenCalledTimes(3);
  });

  it('propagates a marking failure for transaction rollback and allows retry', async () => {
    query
      .mockResolvedValueOnce(rows)
      .mockRejectedValueOnce(new Error('DB failure'));
    await expect(publisher.flush()).rejects.toThrow('DB failure');
    await publisher.flush();
    expect(kafka.send).toHaveBeenCalledTimes(2);
    expect(kafka.send.mock.calls[0]).toEqual(kafka.send.mock.calls[1]);
  });

  it('does not start another batch while waiting for Kafka', async () => {
    const ack = deferred();
    kafka.send.mockReturnValueOnce(ack.promise);
    const work = publisher.flush();
    await vi.waitFor(() => expect(kafka.send).toHaveBeenCalledTimes(1));
    await publisher.flush();
    expect(query).toHaveBeenCalledTimes(1);
    ack.resolve();
    await work;
  });

  it('runs bounded cleanup independently of Kafka and publishing', async () => {
    await publisher.cleanup();
    expect(cleanupQuery).toHaveBeenCalledWith(
      "DELETE FROM social_outbox WHERE id IN (SELECT id FROM social_outbox WHERE published_at < now()-interval '7 days' LIMIT 500)",
    );
    expect(query).not.toHaveBeenCalled();
    expect(kafka.connect).not.toHaveBeenCalled();
  });

  it('isolates cleanup failures and resets its guard for a later retry', async () => {
    cleanupQuery.mockRejectedValueOnce(new Error('cleanup failure'));
    await expect(publisher.cleanup()).rejects.toThrow('cleanup failure');
    await publisher.flush();
    await publisher.cleanup();
    expect(kafka.send).toHaveBeenCalledTimes(1);
    expect(cleanupQuery).toHaveBeenCalledTimes(2);
  });

  it('prevents overlapping cleanup runs', async () => {
    const deletion = deferred();
    cleanupQuery.mockReturnValueOnce(deletion.promise);
    const work = publisher.cleanup();
    await publisher.cleanup();
    expect(cleanupQuery).toHaveBeenCalledTimes(1);
    deletion.resolve();
    await work;
  });

  it('schedules cleanup every five minutes and waits for it during shutdown', async () => {
    vi.useFakeTimers();
    config.set('NODE_ENV', 'development');
    publisher.onModuleInit();
    query.mockResolvedValue([]);
    await vi.advanceTimersByTimeAsync(299999);
    expect(cleanupQuery).not.toHaveBeenCalled();
    const deletion = deferred();
    cleanupQuery.mockReturnValueOnce(deletion.promise);
    await vi.advanceTimersByTimeAsync(1);
    expect(cleanupQuery).toHaveBeenCalledTimes(1);
    const shutdown = publisher.onModuleDestroy();
    expect(kafka.disconnect).not.toHaveBeenCalled();
    const queriesAtShutdown = query.mock.calls.length;
    await vi.advanceTimersByTimeAsync(300000);
    expect(query).toHaveBeenCalledTimes(queriesAtShutdown);
    expect(cleanupQuery).toHaveBeenCalledTimes(1);
    deletion.resolve();
    await shutdown;
    expect(kafka.disconnect).toHaveBeenCalledTimes(1);
  });

  it('catches scheduled cleanup errors and continues polling and cleanup', async () => {
    vi.useFakeTimers();
    config.set('NODE_ENV', 'development');
    query.mockResolvedValue([]);
    cleanupQuery.mockRejectedValueOnce(new Error('cleanup failure'));
    publisher.onModuleInit();
    await vi.advanceTimersByTimeAsync(300000);
    expect(warn).toHaveBeenCalledWith('Social outbox cleanup retry pending');
    const polls = query.mock.calls.length;
    await vi.advanceTimersByTimeAsync(300000);
    expect(query.mock.calls.length).toBeGreaterThan(polls);
    expect(cleanupQuery).toHaveBeenCalledTimes(2);
  });
});
