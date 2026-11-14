import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
  Optional,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { REDIS_CLIENT } from '@loccoc/common';
import type { Redis } from 'ioredis';
import {
  Kafka,
  Partitioners,
  type Admin,
  type Consumer,
  type Producer,
  type SASLOptions,
} from 'kafkajs';
import { randomUUID } from 'node:crypto';
import { isUUID } from 'class-validator';
import { DataSource } from 'typeorm';
import { GraphClient } from './graph.client.js';

export interface RecommendationCache {
  ids: string[];
  computedAt: number;
  dataAsOf: number;
}
export const PUBLISH_RECOMMENDATIONS = `
  if (redis.call('GET',KEYS[1]) or '0') ~= ARGV[1] then return 0 end
  redis.call('SET',KEYS[2],ARGV[2],'EX',ARGV[3]); return 1`;
const UNLOCK = `if redis.call('GET',KEYS[1])==ARGV[1] then return redis.call('DEL',KEYS[1]) end return 0`;
export const PRUNE_CANDIDATE = `
  redis.call('INCR',KEYS[1])
  local raw=redis.call('GET',KEYS[2]); if not raw then return 0 end
  local ttl=redis.call('PTTL',KEYS[2]); if ttl<=0 then return 0 end
  local ok,value=pcall(cjson.decode,raw)
  if not ok or type(value)~='table' or type(value.ids)~='table'
    or type(value.computedAt)~='number' or type(value.dataAsOf)~='number' then
    redis.call('DEL',KEYS[2]);return 0
  end
  local kept={};local removed=0
  for _,id in ipairs(value.ids) do
    if id~=ARGV[1] then table.insert(kept,id) else removed=removed+1 end
  end
  value.ids=kept
  local encoded=cjson.encode(value)
  if #kept==0 then
    value.ids=nil;encoded=cjson.encode(value)
    encoded=string.sub(encoded,1,-2)..',"ids":[]}'
  end
  redis.call('SET',KEYS[2],encoded,'PX',ttl);return removed`;

export type ComputeResult = 'published' | 'locked' | 'stale' | 'unavailable';
interface RefreshClaim {
  user_id: string;
  request_version: string;
  priority: number;
  lease_token: string;
}

@Injectable()
export class DiscoveryRuntime implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DiscoveryRuntime.name);
  private timer?: ReturnType<typeof setInterval>;
  private running?: Promise<void>;
  private refreshRunning?: Promise<void>;
  private refreshBusy = false;
  private stopping = false;
  private busy = false;
  private producer?: Producer;
  private consumer?: Consumer;
  private admin?: Admin;
  private initialized = false;
  private kafkaReady = false;
  private graphCheckedAt = 0;
  private lastCaughtUp = 0;
  private monitorCheckedAt = 0;
  private graphFailedAt = 0;
  private refreshSweepAt = 0;
  private cleanupAt = 0;
  private readonly groupId: string;
  readonly ttl: number;
  readonly lagBudget: number;
  constructor(
    private readonly config: ConfigService,
    private readonly graph: GraphClient,
    @Optional() private readonly db?: DataSource,
    @Optional() @Inject(REDIS_CLIENT) private readonly redis?: Redis | null,
  ) {
    this.groupId = config.get('GRAPH_CONSUMER_GROUP', 'user-service-graph-v1');
    this.ttl = this.number('DISCOVERY_CACHE_TTL_SECONDS', 600, 30, 3600);
    this.lagBudget =
      this.number('DISCOVERY_MAX_LAG_SECONDS', 30, 1, 600) * 1000;
  }
  private number(name: string, fallback: number, min: number, max: number) {
    const value = Number(this.config.get(name, fallback));
    return Number.isInteger(value) && value >= min && value <= max
      ? value
      : fallback;
  }
  get enabled() {
    return this.config.get('DISCOVERY_ENABLED', 'true') !== 'false';
  }
  get graphAvailable() {
    return (
      this.enabled &&
      this.initialized &&
      !this.graphFailedAt &&
      Date.now() - this.graphCheckedAt < 10000
    );
  }
  get fresh() {
    return (
      this.enabled &&
      this.initialized &&
      this.kafkaReady &&
      Date.now() - this.monitorCheckedAt < 10000 &&
      Date.now() - this.lastCaughtUp <= this.lagBudget &&
      (!this.graphFailedAt || Date.now() - this.graphFailedAt <= this.lagBudget)
    );
  }
  get mutualAvailable() {
    return this.graphAvailable && this.fresh && this.redis?.status === 'ready';
  }
  get dataAsOf() {
    return this.lastCaughtUp;
  }
  markGraphFailure() {
    if (!this.graphFailedAt)
      this.logger.warn(
        'Discovery graph unavailable; bounded cached serving only',
      );
    this.graphFailedAt ||= Date.now();
  }
  async cache(id: string): Promise<RecommendationCache | null> {
    if (!this.redis) throw new Error('Recommendation cache unavailable');
    const raw = await this.redis.get(`rec:${id}`);
    if (!raw) return null;
    const value = JSON.parse(raw) as RecommendationCache;
    if (
      !Array.isArray(value.ids) ||
      value.ids.length > 500 ||
      !value.ids.every((v) => typeof v === 'string' && isUUID(v)) ||
      !Number.isFinite(value.computedAt) ||
      !Number.isFinite(value.dataAsOf) ||
      Date.now() - value.computedAt > this.ttl * 1000 ||
      value.computedAt > Date.now() + 1000 ||
      value.computedAt - value.dataAsOf > this.lagBudget
    )
      return null;
    // Do not age dataAsOf unconditionally: an idle, caught-up graph stays fresh.
    // Runtime progress monitoring independently bounds outstanding source changes.
    return value;
  }
  async invalidate(...ids: string[]) {
    if (!this.redis) return;
    try {
      const multi = this.redis.multi();
      for (const id of new Set(ids))
        multi.incr(`rec:gen:${id}`).del(`rec:${id}`);
      const results = await multi.exec();
      if (results?.some(([err]) => err)) throw new Error('Invalidation failed');
    } catch {
      this.logger.warn(
        'Discovery cache invalidation deferred; final database filtering remains active',
      );
    }
  }
  async pruneCandidate(viewerId: string, targetId: string) {
    if (!this.redis) return;
    try {
      await this.redis.eval(
        PRUNE_CANDIDATE,
        2,
        `rec:gen:${viewerId}`,
        `rec:${viewerId}`,
        targetId,
      );
    } catch {
      this.logger.warn(
        'Discovery cache pruning deferred; final database filtering remains active',
      );
    }
  }
  async prunePair(a: string, b: string) {
    await Promise.all([this.pruneCandidate(a, b), this.pruneCandidate(b, a)]);
  }
  private kafka() {
    return new Kafka({
      clientId: 'user-discovery',
      brokers: this.config
        .get<string>('KAFKA_BROKERS', '127.0.0.1:9092')
        .split(','),
      ssl: this.config.get('KAFKA_SSL') === 'true',
      requestTimeout: 5000,
      retry: { retries: 1 },
      ...(this.config.get('KAFKA_SASL_USERNAME')
        ? {
            sasl: {
              mechanism: 'scram-sha-256',
              username: this.config.getOrThrow<string>('KAFKA_SASL_USERNAME'),
              password: this.config.getOrThrow<string>('KAFKA_SASL_PASSWORD'),
            } as SASLOptions,
          }
        : {}),
    });
  }
  private get graphTopic() {
    return this.config.get<string>(
      'SOCIAL_GRAPH_EVENTS_TOPIC',
      'social.graph.events',
    );
  }
  private get accountTopic() {
    return this.config.get<string>('ACCOUNT_EVENTS_TOPIC', 'account.events');
  }
  onModuleInit() {
    if (this.config.get('NODE_ENV') === 'test') return;
    this.timer = setInterval(() => {
      if (!this.busy && !this.stopping)
        this.running = this.tick().catch(() =>
          this.logger.warn('Discovery background retry pending'),
        );
      if (!this.refreshBusy && !this.stopping)
        this.refreshRunning = this.refresh().catch(() =>
          this.logger.warn('Discovery refresh retry pending'),
        );
    }, 2000);
    this.timer.unref();
  }
  async tick() {
    if (this.busy || this.stopping) return;
    this.busy = true;
    try {
      // Text-search sessions must still be cleaned during a graph outage or
      // when graph discovery is disabled; search remains operational then.
      if (Date.now() - this.cleanupAt > 60000) {
        await this.db!.query(`DELETE FROM discovery_search_sessions WHERE id IN
          (SELECT id FROM discovery_search_sessions WHERE expires_at<clock_timestamp() LIMIT 5000)`);
        await this.db!.query(`DELETE FROM graph_outbox WHERE id IN
          (SELECT id FROM graph_outbox WHERE published_at<clock_timestamp()-interval '7 days' LIMIT 500)`);
        await this.db!
          .query(`DELETE FROM suggestion_feedback WHERE (viewer_id,target_id,reason) IN
          (SELECT viewer_id,target_id,reason FROM suggestion_feedback WHERE expires_at<clock_timestamp() LIMIT 500)`);
        this.cleanupAt = Date.now();
      }
      if (!this.enabled) return;
      if (!this.initialized) {
        await this.graph.initialize();
        await this.bootstrap();
        this.initialized = true;
      }
      if (!this.consumer) await this.connect();
      await this.publish();
      try {
        await this.graph.query('RETURN 1 AS ok');
        this.graphCheckedAt = Date.now();
        this.graphFailedAt = 0;
      } catch {
        this.markGraphFailure();
      }
      await this.monitor();
    } finally {
      this.busy = false;
    }
  }
  async bootstrap() {
    // Page snapshots from the source; independent per-entity versions make overlap
    // with live writes/replayed history safe. No dependence on outbox retention.
    let after = '00000000-0000-0000-0000-000000000000';
    for (;;) {
      const rows: {
        id: string;
        account_version: string;
        account_status: string;
        profile: unknown;
      }[] = await this.db!.query(
        `SELECT id,account_version,
        CASE WHEN deleted_at IS NOT NULL THEN 'deleted' ELSE account_status END AS account_status,
        jsonb_build_object('eventType','USER_PROFILE_SNAPSHOT','version',1,'userId',id,'profileVersion',profile_version,
          'username',username,'displayNameNorm',display_name_norm,'recommendable',recommendable,
          'mutualVisibility',mutual_friends_visibility) AS profile FROM users WHERE id>$1 ORDER BY id LIMIT 200`,
        [after],
      );
      if (!rows.length) break;
      for (const row of rows) {
        await this.graph.apply(row.profile);
        if (Number(row.account_version) > 0)
          await this.graph.account(
            row.id,
            Number(row.account_version),
            row.account_status,
          );
      }
      after = rows.at(-1)!.id;
      if (this.stopping) return;
    }
    let pairAfter = [
      '00000000-0000-0000-0000-000000000000',
      '00000000-0000-0000-0000-000000000000',
    ];
    for (;;) {
      const rows: { key: string; payload: unknown }[] = await this.db!.query(
        `SELECT s.user_low_id||':'||s.user_high_id AS key,
        jsonb_build_object('eventType','PAIR_STATE_SNAPSHOT','version',1,'lowId',s.user_low_id,'highId',s.user_high_id,
          'pairVersion',s.pair_version,'friends',EXISTS(SELECT 1 FROM friendships f WHERE f.user_low_id=s.user_low_id AND f.user_high_id=s.user_high_id),
          'requestedBy',(SELECT sender_id FROM friend_requests WHERE LEAST(sender_id,receiver_id)=s.user_low_id
            AND GREATEST(sender_id,receiver_id)=s.user_high_id AND status='PENDING'),
          'lowBlocksHigh',EXISTS(SELECT 1 FROM user_blocks WHERE blocker_id=s.user_low_id AND blocked_id=s.user_high_id),
          'highBlocksLow',EXISTS(SELECT 1 FROM user_blocks WHERE blocker_id=s.user_high_id AND blocked_id=s.user_low_id)) AS payload
        FROM pair_states s WHERE s.pair_version>0 AND (s.user_low_id,s.user_high_id)>($1::uuid,$2::uuid)
        ORDER BY s.user_low_id,s.user_high_id LIMIT 200`,
        pairAfter,
      );
      if (!rows.length) break;
      for (const row of rows) await this.graph.apply(row.payload, row.key);
      pairAfter = rows.at(-1)!.key.split(':');
      if (this.stopping) return;
    }
  }
  private async connect() {
    const kafka = this.kafka();
    this.producer ??= kafka.producer({
      createPartitioner: Partitioners.DefaultPartitioner,
    });
    this.admin ??= kafka.admin();
    await this.producer.connect();
    await this.admin.connect();
    if (!(await this.admin.listTopics()).includes(this.graphTopic))
      await this.admin.createTopics({
        waitForLeaders: true,
        topics: [
          { topic: this.graphTopic, numPartitions: 3, replicationFactor: 1 },
        ],
      });
    const consumer = kafka.consumer({
      groupId: this.groupId,
      sessionTimeout: 30000,
    });
    try {
      await consumer.connect();
      await consumer.subscribe({
        topics: [this.graphTopic, this.accountTopic],
        fromBeginning: true,
      });
      consumer.on(consumer.events.CRASH, () => {
        this.kafkaReady = false;
        this.consumer = undefined;
        void consumer.disconnect().catch(() => undefined);
      });
      await consumer.run({
        eachMessage: async ({ topic, partition, message }) => {
          const input: unknown = JSON.parse(
            message.value?.toString() ?? 'null',
          );
          if (topic === this.graphTopic) {
            const key = message.key?.toString();
            if (!key) throw new Error('Missing graph partition key');
            const event = await this.graph.apply(input, key);
            if (event.eventType === 'PAIR_STATE_SNAPSHOT') {
              await this.prunePair(event.lowId, event.highId);
              await this.db!.query(
                'SELECT request_discovery_refresh($1,2::smallint),request_discovery_refresh($2,2::smallint)',
                [event.lowId, event.highId],
              );
            } else {
              await this.invalidate(event.userId);
              await this.db!.query(
                'SELECT request_discovery_refresh($1,2::smallint)',
                [event.userId],
              );
            }
          } else {
            const e = input as {
              eventType?: string;
              aggregateId?: string;
              version?: number;
              data?: { id: string; version: number; status: string };
            };
            if (
              e?.eventType !== 'ACCOUNT_CHANGED' ||
              !e.data ||
              e.aggregateId !== e.data.id ||
              e.version !== e.data.version ||
              message.key?.toString() !== e.data.id
            )
              throw new Error('Invalid graph account envelope');
            await this.graph.account(e.data.id, e.data.version, e.data.status);
            await this.invalidate(e.data.id);
          }
          await this.db!.query(
            `INSERT INTO graph_projection_offsets(topic,partition,next_offset) VALUES($1,$2,$3)
          ON CONFLICT(topic,partition) DO UPDATE SET next_offset=GREATEST(graph_projection_offsets.next_offset,EXCLUDED.next_offset),
          updated_at=clock_timestamp()`,
            [topic, partition, (BigInt(message.offset) + 1n).toString()],
          );
        },
      });
      this.consumer = consumer;
      this.kafkaReady = true;
    } catch (e) {
      await consumer.disconnect();
      throw e;
    }
  }
  async publish() {
    await this.db!.transaction(async (m) => {
      const rows: { id: string; partition_key: string; payload: unknown }[] =
        await m.query(`SELECT * FROM graph_outbox WHERE published_at IS NULL
        ORDER BY created_at,id LIMIT 100 FOR UPDATE SKIP LOCKED`);
      if (!rows.length) return;
      await this.producer!.send({
        topic: this.graphTopic,
        messages: rows.map((row) => ({
          key: row.partition_key,
          value: JSON.stringify(row.payload),
        })),
      });
      await m.query(
        'UPDATE graph_outbox SET published_at=clock_timestamp() WHERE id=ANY($1::uuid[])',
        [rows.map((r) => r.id)],
      );
    });
  }
  async monitor() {
    let caughtUp = true;
    for (const topic of [this.graphTopic, this.accountTopic]) {
      const high = await this.admin!.fetchTopicOffsets(topic);
      const rows: { partition: number; next_offset: string }[] =
        await this.db!.query(
          'SELECT partition,next_offset FROM graph_projection_offsets WHERE topic=$1',
          [topic],
        );
      for (const p of high)
        if (
          BigInt(
            rows.find((r) => r.partition === p.partition)?.next_offset ?? p.low,
          ) < BigInt(p.high)
        )
          caughtUp = false;
    }
    const [pending]: { oldest: Date | null }[] = await this.db!.query(
      'SELECT min(created_at) AS oldest FROM graph_outbox WHERE published_at IS NULL',
    );
    if (pending?.oldest) {
      caughtUp = false;
      this.lastCaughtUp = Math.min(
        this.lastCaughtUp,
        new Date(pending.oldest).getTime(),
      );
    }
    if (caughtUp) this.lastCaughtUp = Date.now();
    this.monitorCheckedAt = Date.now();
  }
  async claimRefresh(limit = 3): Promise<RefreshClaim[]> {
    // The single UPDATE commits the short row locks before any network calls.
    return this.db!.query(
      `WITH next AS (
      SELECT user_id FROM discovery_refresh_queue
      WHERE available_at<=clock_timestamp() AND (lease_until IS NULL OR lease_until<clock_timestamp())
      ORDER BY priority DESC,requested_at,user_id LIMIT $1 FOR UPDATE SKIP LOCKED
    ), claimed AS (UPDATE discovery_refresh_queue q SET lease_token=$2,lease_until=clock_timestamp()+interval '30 seconds'
      FROM next WHERE q.user_id=next.user_id
      RETURNING q.user_id,q.priority,q.request_version::text,q.lease_token,q.requested_at)
      SELECT * FROM claimed ORDER BY priority DESC,requested_at,user_id`,
      [limit, randomUUID()],
    );
  }
  async finishRefresh(claim: RefreshClaim, completed: boolean) {
    if (completed)
      await this.db!.query(
        `DELETE FROM discovery_refresh_queue
      WHERE user_id=$1 AND lease_token=$2 AND request_version=$3`,
        [claim.user_id, claim.lease_token, claim.request_version],
      );
    // A newer request survives acknowledgement of an older computation. Only
    // the lease owner may release it; a skipped/failed job gets a short backoff.
    await this.db!.query(
      `UPDATE discovery_refresh_queue SET lease_token=NULL,lease_until=NULL,
      available_at=CASE WHEN request_version<>$3 THEN clock_timestamp()
        ELSE clock_timestamp()+interval '2 seconds' END
      WHERE user_id=$1 AND lease_token=$2`,
      [claim.user_id, claim.lease_token, claim.request_version],
    );
  }
  async refresh() {
    if (
      this.refreshBusy ||
      this.stopping ||
      !this.graphAvailable ||
      !this.fresh ||
      this.redis?.status !== 'ready'
    )
      return;
    this.refreshBusy = true;
    try {
      if (Date.now() - this.refreshSweepAt > 60000) {
        await this.db!
          .query(`INSERT INTO discovery_refresh_queue(user_id,priority)
          SELECT id,0 FROM users WHERE username IS NOT NULL AND account_status='active' AND deleted_at IS NULL
          ON CONFLICT DO NOTHING`);
        this.refreshSweepAt = Date.now();
      }
      const claims = await this.claimRefresh();
      await Promise.all(
        claims.map(async (claim) => {
          let completed = false;
          try {
            const existing = await this.cache(claim.user_id);
            if (
              existing &&
              claim.priority === 0 &&
              Date.now() - existing.computedAt <
                Math.max(1, this.ttl - 60) * 1000
            )
              completed = true;
            else
              completed = (await this.compute(claim.user_id)) === 'published';
          } catch (error) {
            const code =
              error instanceof Error &&
              error.message.startsWith('Graph query failed (')
                ? error.message
                : 'dependency failure';
            this.logger.warn(
              `Discovery refresh job retained for retry: ${code}`,
            );
          }
          await this.finishRefresh(claim, completed);
        }),
      );
    } finally {
      this.refreshBusy = false;
    }
  }
  async compute(id: string): Promise<ComputeResult> {
    if (!this.redis || !this.fresh || !this.graphAvailable)
      return 'unavailable';
    const lock = `rec:lock:${id}`,
      token = randomUUID();
    if ((await this.redis.set(lock, token, 'EX', 15, 'NX')) !== 'OK')
      return 'locked';
    try {
      const capturedGen = (await this.redis.get(`rec:gen:${id}`)) ?? '0';
      const dataAsOf = this.dataAsOf,
        startedAt = Date.now();
      let candidates;
      try {
        candidates = await this.graph.candidates(id);
      } catch (error) {
        this.markGraphFailure();
        throw error;
      }
      if (!this.fresh || Date.now() - startedAt > 10000) return 'stale';
      const published = await this.redis.eval(
        PUBLISH_RECOMMENDATIONS,
        2,
        `rec:gen:${id}`,
        `rec:${id}`,
        capturedGen,
        JSON.stringify({
          ids: candidates.map((c) => c.id),
          computedAt: Date.now(),
          dataAsOf,
        }),
        String(this.ttl),
      );
      return Number(published) === 1 ? 'published' : 'stale';
    } finally {
      await this.redis.eval(UNLOCK, 1, lock, token).catch(() => undefined);
    }
  }
  async onModuleDestroy() {
    this.stopping = true;
    if (this.timer) clearInterval(this.timer);
    await Promise.all([
      this.running?.catch(() => undefined),
      this.refreshRunning?.catch(() => undefined),
    ]);
    await this.consumer?.disconnect();
    await this.producer?.disconnect();
    await this.admin?.disconnect();
  }
}
