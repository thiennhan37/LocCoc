import 'reflect-metadata';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';
import { USER_MIGRATIONS } from '../src/database/database.module.js';
import { SocialRepository } from '../src/social/social.repository.js';
import { DiscoveryRepository } from '../src/discovery/discovery.repository.js';
import {
  GraphClient,
  type PairSnapshot,
  type ProfileSnapshot,
} from '../src/discovery/graph.client.js';
import {
  DiscoveryRuntime,
  PUBLISH_RECOMMENDATIONS,
} from '../src/discovery/discovery.runtime.js';
import { Kafka, logLevel } from 'kafkajs';

const url = process.env.DISCOVERY_TEST_DB_URL;
describe.skipIf(!url)('smart discovery on isolated PostgreSQL', () => {
  let db: DataSource, social: SocialRepository, repo: DiscoveryRepository;
  const schema = `discovery_${randomUUID().replaceAll('-', '')}`;
  const ids = Array.from({ length: 8 }, () => randomUUID());
  beforeAll(async () => {
    db = await new DataSource({
      type: 'postgres',
      url,
      extra: {
        options: `-c search_path=${schema},public -c application_name=${schema}`,
      },
    }).initialize();
    await db.query(`CREATE SCHEMA ${schema}`);
    const q = db.createQueryRunner();
    for (const M of USER_MIGRATIONS) await new M().up(q);
    await q.release();
    social = new SocialRepository(db);
    repo = new DiscoveryRepository(db);
  });
  afterAll(async () => {
    if (db?.isInitialized) {
      await db.query(`DROP SCHEMA ${schema} CASCADE`);
      await db.destroy();
    }
  });
  beforeEach(async () => {
    await db.query('TRUNCATE users CASCADE');
    await db.query(
      'TRUNCATE graph_outbox,social_outbox,graph_projection_offsets',
    );
    for (let i = 0; i < ids.length; i++) {
      await social.project({
        id: ids[i]!,
        email: `u${i}@discovery.test`,
        phone: null,
        status: 'active',
        version: 1,
      });
      await social.claim(
        ids[i]!,
        `user_${i}`,
        i === 1 ? 'Nguyễn Đặng Minh' : `Person ${i}`,
      );
    }
  });
  const a = ids[0]!,
    b = ids[1]!,
    c = ids[2]!,
    d = ids[3]!;
  async function friend(x: string, y: string) {
    const r = await social.send(x, y);
    await social.resolve(y, r.id, 'ACCEPTED');
  }
  async function recSession(x: string, targets: string[]) {
    return repo.createSession(x, '__recommendations', targets, false);
  }
  async function recommended(x: string, cursor: string) {
    return (await repo.page(x, '__recommendations', cursor, 20, true)).data.map(
      (u) => u.id,
    );
  }
  it('defaults privacy on and normalizes Vietnamese including đ', async () => {
    expect(await repo.privacy(b)).toEqual({
      recommendable: true,
      mutualVisibility: true,
    });
    expect(await repo.normalize('  Nguyễn ĐẶNG  ')).toBe('nguyen dang');
    expect(await repo.searchIds(a, 'nguyen dang', [])).toContain(b);
  });
  it('reserves exact username over graph proximity and escapes underscore literally', async () => {
    const found = await repo.searchIds(a, 'user_1', [
      { id: c, distance: 1, score: 99 },
    ]);
    expect(found[0]).toBe(b);
    expect(found).not.toContain(c);
  });
  it('keeps frozen pagination while rechecking names and eligibility', async () => {
    const cursor = await repo.createSession(
      a,
      'person',
      [c, d, ids[4]!],
      false,
    );
    const first = await repo.page(a, 'person', cursor, 1);
    expect(first.data[0]!.id).toBe(c);
    await social.block(a, d);
    const second = await repo.page(a, 'person', first.nextCursor!, 1);
    expect(second.data.map((u) => u.id)).toEqual([ids[4]]);
    await expect(repo.page(b, 'person', cursor, 1)).rejects.toThrow(
      'Restart this search',
    );
  });
  it('removes freshly renamed text matches from an old search session', async () => {
    const cursor = await repo.createSession(a, 'nguyen', [b], false);
    await db.query("UPDATE users SET display_name='Tên khác' WHERE id=$1", [b]);
    expect((await repo.page(a, 'nguyen', cursor, 20)).data).toEqual([]);
  });
  it('filters self, pending both ways, friends, blocks both ways, privacy and inactive accounts from stale recommendations', async () => {
    const cursor = await recSession(a, ids);
    await social.send(a, b);
    await social.send(c, a);
    await friend(a, d);
    await social.block(ids[4]!, a);
    await repo.setPrivacy(ids[5]!, { recommendable: false });
    await social.project({
      id: ids[6]!,
      email: 'u6@discovery.test',
      phone: null,
      status: 'suspended',
      version: 2,
    });
    expect(await recommended(a, cursor)).toEqual([ids[7]]);
  });
  it('does not hide nonrecommendable users or pending relationships from text search', async () => {
    await repo.setPrivacy(b, { recommendable: false });
    await social.send(a, b);
    const cursor = await repo.createSession(
      a,
      'user_1',
      await repo.searchIds(a, 'user_1', []),
      false,
    );
    expect(
      (await repo.page(a, 'user_1', cursor, 20)).data[0]?.relationshipStatus,
    ).toBe('OUTGOING_PENDING');
  });
  it('dismisses for 90 days one-way, idempotently, persisting beyond cache lifetime', async () => {
    await repo.dismiss(a, b);
    const before = await db.query(
      'SELECT expires_at FROM suggestion_feedback WHERE viewer_id=$1',
      [a],
    );
    await repo.dismiss(a, b);
    expect(
      await db.query(
        'SELECT expires_at FROM suggestion_feedback WHERE viewer_id=$1',
        [a],
      ),
    ).toEqual(before);
    expect(await recommended(a, await recSession(a, [b]))).toEqual([]);
    expect(await recommended(b, await recSession(b, [a]))).toEqual([a]);
    await social.send(a, b); // Manual invitation is still permitted.
  });
  it.each([
    ['REJECTED', 'REJECT', 30],
    ['CANCELLED', 'CANCEL', 7],
  ] as const)(
    'applies %s cooldown bilaterally',
    async (action, reason, days) => {
      const r = await social.send(a, b);
      await social.resolve(action === 'CANCELLED' ? a : b, r.id, action);
      const rows =
        await db.query(`SELECT reason,extract(epoch FROM expires_at-clock_timestamp())/86400 AS days
      FROM suggestion_feedback ORDER BY viewer_id`);
      expect(rows).toHaveLength(2);
      for (const row of rows) {
        expect(row.reason).toBe(reason);
        expect(Number(row.days)).toBeCloseTo(days, 2);
      }
      expect(await recommended(a, await recSession(a, [b]))).toEqual([]);
      expect(await recommended(b, await recSession(b, [a]))).toEqual([]);
      await social.send(a, b);
    },
  );
  it('suppresses unfriend for 30 days bilaterally without extending it on retries', async () => {
    await friend(a, b);
    await social.unfriend(a, b);
    const before = await db.query(
      "SELECT viewer_id,expires_at FROM suggestion_feedback WHERE reason='UNFRIEND' ORDER BY viewer_id",
    );
    await social.unfriend(a, b);
    expect(
      await db.query(
        "SELECT viewer_id,expires_at FROM suggestion_feedback WHERE reason='UNFRIEND' ORDER BY viewer_id",
      ),
    ).toEqual(before);
    expect(before).toHaveLength(2);
    expect(
      (before[0].expires_at.getTime() - Date.now()) / 86400000,
    ).toBeCloseTo(30, 2);
    expect(await recommended(a, await recSession(a, [b]))).toEqual([]);
    await db.query(
      "UPDATE suggestion_feedback SET expires_at=clock_timestamp()-interval '1 second'",
    );
    expect(await recommended(a, await recSession(a, [b]))).toEqual([b]);
    await social.send(a, b);
  });
  it('removes hidden intermediaries from names and exact counts immediately', async () => {
    await friend(a, c);
    await friend(b, c);
    await friend(a, d);
    await friend(b, d);
    expect((await repo.mutual(a, b)).count).toBe(2);
    await repo.setPrivacy(c, { mutualVisibility: false });
    const evidence = await repo.mutual(a, b);
    expect(evidence.count).toBe(1);
    expect(evidence.data.map((u) => u.id)).toEqual([d]);
    await social.unfriend(b, d);
    expect((await repo.mutual(a, b)).count).toBe(0);
  });
  it('hides an entire target section but leaves the hidden viewer able to view other permitted targets', async () => {
    await friend(a, c);
    await friend(b, c);
    await repo.setPrivacy(b, { mutualVisibility: false });
    expect(await repo.mutual(a, b)).toMatchObject({
      state: 'hidden',
      count: null,
      data: [],
    });
    expect((await repo.mutual(b, a)).count).toBe(1);
  });
  it('returns 404 for blocked targets and excludes intermediaries blocked with either endpoint', async () => {
    await friend(a, c);
    await friend(b, c);
    await social.block(c, a);
    expect((await repo.mutual(a, b)).count).toBe(0);
    await social.block(b, a);
    await expect(repo.mutual(a, b)).rejects.toThrow('User not found');
  });
  it('keeps pair versions after deletion and preserves notification-only contracts', async () => {
    await friend(a, b);
    await social.unfriend(a, b);
    await social.block(a, b);
    await social.unblock(a, b);
    const rows = await db.query(
      "SELECT payload FROM graph_outbox WHERE payload->>'eventType'='PAIR_STATE_SNAPSHOT' ORDER BY created_at,id",
    );
    const versions = rows.map((r) => r.payload.pairVersion as number);
    expect(new Set(versions).size).toBe(versions.length);
    expect(versions).toEqual([...versions].sort((x, y) => x - y));
    expect(rows.at(-1).payload).toMatchObject({
      friends: false,
      requestedBy: null,
      lowBlocksHigh: false,
      highBlocksLow: false,
    });
    const notifications = await db.query('SELECT payload FROM social_outbox');
    expect(notifications.map((r) => r.payload.eventType)).toEqual([
      'FRIEND_REQUEST_RECEIVED',
      'FRIEND_REQUEST_ACCEPTED',
    ]);
    expect(notifications.every((r) => r.payload.version === 1)).toBe(true);
  });
  it('allocates one winning pending pair under concurrent sends', async () => {
    const results = await Promise.allSettled([
      social.send(a, b),
      social.send(b, a),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(
      (
        await db.query(
          "SELECT count(*)::int AS n FROM friend_requests WHERE status='PENDING'",
        )
      )[0].n,
    ).toBe(1);
  });
  it('rolls back profile state, version and outbox together', async () => {
    const [before] = await db.query(
      'SELECT profile_version,display_name_norm FROM users WHERE id=$1',
      [b],
    );
    const [{ n }] = await db.query(
      'SELECT count(*)::int AS n FROM graph_outbox',
    );
    await expect(
      db.transaction(async (m) => {
        await m.query("UPDATE users SET display_name='Changed' WHERE id=$1", [
          b,
        ]);
        throw new Error('rollback');
      }),
    ).rejects.toThrow('rollback');
    expect(
      (
        await db.query(
          'SELECT profile_version,display_name_norm FROM users WHERE id=$1',
          [b],
        )
      )[0],
    ).toEqual(before);
    expect(
      (await db.query('SELECT count(*)::int AS n FROM graph_outbox'))[0].n,
    ).toBe(n);
  });

  it('prioritizes on-demand jobs and claims disjoint leases across workers', async () => {
    const graph = new GraphClient(new ConfigService());
    const one = new DiscoveryRuntime(
      new ConfigService({ NODE_ENV: 'test' }),
      graph,
      db,
    );
    const two = new DiscoveryRuntime(
      new ConfigService({ NODE_ENV: 'test' }),
      graph,
      db,
    );
    await db.query(
      `INSERT INTO discovery_refresh_queue(user_id,requested_at) SELECT id,clock_timestamp()-interval '1 hour' FROM users`,
    );
    await repo.enqueue(ids[7]!);
    const top = await one.claimRefresh(1);
    expect(top[0]?.user_id).toBe(ids[7]);
    await one.finishRefresh(top[0]!, true);
    const [first, second] = await Promise.all([
      one.claimRefresh(3),
      two.claimRefresh(3),
    ]);
    expect(first).toHaveLength(3);
    expect(second).toHaveLength(3);
    expect(new Set([...first, ...second].map((job) => job.user_id)).size).toBe(
      6,
    );
  });
  it('does not acknowledge newer work or delete a lease owned by another worker', async () => {
    const runtime = new DiscoveryRuntime(
      new ConfigService({ NODE_ENV: 'test' }),
      new GraphClient(new ConfigService()),
      db,
    );
    await repo.enqueue(a);
    const [old] = await runtime.claimRefresh(1);
    await repo.enqueue(a);
    await runtime.finishRefresh(old!, true);
    const [pending] = await db.query(
      'SELECT * FROM discovery_refresh_queue WHERE user_id=$1',
      [a],
    );
    expect(pending.lease_token).toBeNull();
    expect(Number(pending.request_version)).toBe(
      Number(old!.request_version) + 1,
    );
    const [owner] = await runtime.claimRefresh(1);
    await db.query(
      "UPDATE discovery_refresh_queue SET lease_until=clock_timestamp()-interval '1 second' WHERE user_id=$1",
      [a],
    );
    const [replacement] = await runtime.claimRefresh(1);
    await runtime.finishRefresh(owner!, true);
    expect(
      (
        await db.query(
          'SELECT lease_token FROM discovery_refresh_queue WHERE user_id=$1',
          [a],
        )
      )[0].lease_token,
    ).toBe(replacement!.lease_token);
    await runtime.finishRefresh(replacement!, true);
    expect(
      await db.query('SELECT * FROM discovery_refresh_queue WHERE user_id=$1', [
        a,
      ]),
    ).toEqual([]);
  });
  it('block removes an existing friendship with a non-extending bilateral 30-day cooldown', async () => {
    await friend(a, b);
    await social.block(a, b);
    const before = await db.query(
      "SELECT viewer_id,expires_at FROM suggestion_feedback WHERE reason='UNFRIEND' ORDER BY viewer_id",
    );
    expect(before).toHaveLength(2);
    await social.block(a, b);
    expect(
      await db.query(
        "SELECT viewer_id,expires_at FROM suggestion_feedback WHERE reason='UNFRIEND' ORDER BY viewer_id",
      ),
    ).toEqual(before);
    await social.unblock(a, b);
    expect(await recommended(a, await recSession(a, [b]))).toEqual([]);
    await social.send(a, b);
  });
  it.skipIf(!process.env.DISCOVERY_TEST_REDIS_URL)(
    'prunes one viewer atomically, preserves TTL/other cache and rejects stale publication',
    async () => {
      const redis = new Redis(process.env.DISCOVERY_TEST_REDIS_URL!);
      const runtime = new DiscoveryRuntime(
        new ConfigService({ NODE_ENV: 'test' }),
        new GraphClient(new ConfigService()),
        db,
        redis,
      );
      const entry = (targets: string[]) =>
        JSON.stringify({
          ids: targets,
          computedAt: Date.now(),
          dataAsOf: Date.now(),
        });
      try {
        await redis.set(`rec:${a}`, entry([b, c]), 'PX', 300000);
        await redis.set(`rec:${b}`, entry([a, d]), 'PX', 300000);
        await redis.set(`rec:gen:${a}`, '5');
        await redis.set(`rec:gen:${b}`, '9');
        const target = await redis.get(`rec:${b}`);
        const ttl = await redis.pttl(`rec:${a}`);
        await runtime.pruneCandidate(a, b);
        expect((await runtime.cache(a))?.ids).toEqual([c]);
        expect(await redis.get(`rec:gen:${a}`)).toBe('6');
        expect(await redis.get(`rec:${b}`)).toBe(target);
        expect(await redis.get(`rec:gen:${b}`)).toBe('9');
        expect(await redis.pttl(`rec:${a}`)).toBeLessThanOrEqual(ttl);
        expect(await redis.pttl(`rec:${a}`)).toBeGreaterThan(ttl - 2000);
        expect(
          await redis.eval(
            PUBLISH_RECOMMENDATIONS,
            2,
            `rec:gen:${a}`,
            `rec:${a}`,
            '5',
            entry([b, c]),
            '600',
          ),
        ).toBe(0);
        await runtime.pruneCandidate(a, c);
        expect((await runtime.cache(a))?.ids).toEqual([]);
      } finally {
        for (const id of [a, b]) await redis.del(`rec:${id}`, `rec:gen:${id}`);
        await redis.quit();
      }
    },
  );
  it.skipIf(!process.env.DISCOVERY_TEST_REDIS_URL)(
    'retains a locked job and computes outside PostgreSQL transactions',
    async () => {
      const redis = new Redis(process.env.DISCOVERY_TEST_REDIS_URL!);
      await redis.ping();
      const graph = new GraphClient(new ConfigService());
      const runtime = new DiscoveryRuntime(
        new ConfigService({ NODE_ENV: 'test' }),
        graph,
        db,
        redis,
      );
      const graphQuery = vi
        .spyOn(graph, 'candidates')
        .mockImplementation(async () => {
          const locks = await db.query(
            "SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname=current_database() AND state='idle in transaction' AND application_name=$1",
            [schema],
          );
          expect(locks[0].n).toBe(0);
          return [];
        });
      vi.spyOn(runtime, 'fresh', 'get').mockReturnValue(true);
      vi.spyOn(runtime, 'graphAvailable', 'get').mockReturnValue(true);
      vi.spyOn(runtime, 'dataAsOf', 'get').mockImplementation(() => Date.now());
      try {
        await repo.enqueue(a);
        await redis.set(`rec:lock:${a}`, 'other-worker', 'EX', 15);
        await runtime.refresh();
        expect(
          (
            await db.query(
              'SELECT lease_token FROM discovery_refresh_queue WHERE user_id=$1',
              [a],
            )
          )[0].lease_token,
        ).toBeNull();
        expect(await redis.get(`rec:${a}`)).toBeNull();
        await redis.del(`rec:lock:${a}`);
        await db.query(
          'UPDATE discovery_refresh_queue SET available_at=clock_timestamp() WHERE user_id=$1',
          [a],
        );
        await runtime.refresh();
        expect((await runtime.cache(a))?.ids).toEqual([]);
        expect(
          await db.query(
            'SELECT * FROM discovery_refresh_queue WHERE user_id=$1',
            [a],
          ),
        ).toEqual([]);
        expect(graphQuery).toHaveBeenCalled();
      } finally {
        for (const id of ids)
          await redis.del(`rec:${id}`, `rec:gen:${id}`, `rec:lock:${id}`);
        await redis.quit();
      }
    },
  );

  describe.skipIf(!process.env.DISCOVERY_TEST_NEO4J_URL)(
    'real Neo4j projection',
    () => {
      let graph: GraphClient;
      beforeAll(async () => {
        graph = new GraphClient(
          new ConfigService({
            NEO4J_HTTP_URL: process.env.DISCOVERY_TEST_NEO4J_URL,
            NEO4J_PASSWORD:
              process.env.DISCOVERY_TEST_NEO4J_PASSWORD ?? 'test-only-unused',
          }),
        );
        await graph.initialize();
      });
      afterAll(async () => {
        if (graph)
          await graph.query(
            'MATCH (u:User) WHERE u.id IN $ids DETACH DELETE u',
            { ids },
          );
        if (graph)
          await graph.query(
            "MATCH (w:PairWatermark) WHERE split(w.pairKey,':')[0] IN $ids DELETE w",
            { ids },
          );
      });
      const pair = (
        x: string,
        y: string,
        v: number,
        friends: boolean,
      ): PairSnapshot => ({
        eventType: 'PAIR_STATE_SNAPSHOT',
        version: 1,
        lowId: [x, y].sort()[0]!,
        highId: [x, y].sort()[1]!,
        pairVersion: v,
        friends,
        requestedBy: null,
        lowBlocksHigh: false,
        highBlocksLow: false,
      });
      const profile = (
        id: string,
        v: number,
        mutualVisibility = true,
      ): ProfileSnapshot => ({
        eventType: 'USER_PROFILE_SNAPSHOT',
        version: 1,
        userId: id,
        profileVersion: v,
        username: `p_${ids.indexOf(id)}`,
        displayNameNorm: 'nguyen',
        recommendable: true,
        mutualVisibility,
      });
      it('never revives deleted edges on duplicate or old replay, even with concurrent writes', async () => {
        await graph.apply(pair(a, b, 10, true));
        await graph.apply(pair(a, b, 12, false));
        await Promise.all([
          graph.apply(pair(a, b, 11, true)),
          graph.apply(pair(a, b, 12, false)),
        ]);
        const [row] = await graph.query(
          'MATCH (w:PairWatermark {pairKey:$key}) OPTIONAL MATCH (:User {id:$a})-[r:FRIEND]-(:User {id:$b}) RETURN w.lastVersion AS version,count(r) AS edges',
          { key: [a, b].sort().join(':'), a, b },
        );
        expect(row).toEqual({ version: 12, edges: 0 });
      });
      it('does not grant placeholder status/privacy and separates account/profile versions', async () => {
        await graph.apply(pair(c, d, 1, true));
        const [placeholder] = await graph.query(
          'MATCH (u:User {id:$id}) RETURN u.status AS status,u.mutualVisibility AS visibility',
          { id: c },
        );
        expect(placeholder).toEqual({ status: null, visibility: null });
        await graph.account(c, 5, 'suspended');
        await graph.apply(profile(c, 3, false));
        await graph.account(c, 4, 'active');
        await graph.apply(profile(c, 2, true));
        const [row] = await graph.query(
          'MATCH (u:User {id:$id}) RETURN u.status AS status,u.mutualVisibility AS visibility',
          { id: c },
        );
        expect(row).toEqual({ status: 'suspended', visibility: false });
      });
      it('prioritizes 2-hop, fills 3-hop and prunes hidden bridges while allowing nonrecommendable bridges', async () => {
        for (const id of ids) {
          await graph.account(id, 100, 'active');
          await graph.apply(profile(id, 100));
        }
        await graph.apply(pair(a, b, 100, true));
        await graph.apply(pair(b, c, 100, true));
        await graph.apply(pair(c, d, 100, true));
        const found = await graph.candidates(a);
        expect(found.find((x) => x.id === c)?.distance).toBe(2);
        expect(found.find((x) => x.id === d)?.distance).toBe(3);
        await graph.apply({ ...profile(b, 101), recommendable: false });
        expect((await graph.candidates(a)).map((x) => x.id)).toContain(c);
        await graph.apply(profile(b, 102, false));
        expect((await graph.candidates(a)).map((x) => x.id)).not.toContain(c);
      });
      it('scores two-hop common friends independently of longer paths', async () => {
        for (const id of ids) {
          await graph.account(id, 400, 'active');
          await graph.apply(profile(id, 400));
        }
        const e = ids[4]!,
          x = ids[5]!,
          y = ids[6]!,
          z = ids[7]!;
        for (const [left, right] of [
          [a, b],
          [a, e],
          [b, c],
          [b, d],
          [e, d],
          [b, x],
          [x, c],
          [b, y],
          [y, c],
          [b, z],
          [z, c],
        ])
          await graph.apply(pair(left!, right!, 400, true));
        const found = await graph.candidates(a),
          two = found.filter((candidate) => candidate.distance === 2);
        expect(two.find((candidate) => candidate.id === c)?.score).toBe(1);
        expect(two.find((candidate) => candidate.id === d)?.score).toBe(2);
        expect(two.findIndex((candidate) => candidate.id === d)).toBeLessThan(
          two.findIndex((candidate) => candidate.id === c),
        );
      });
    },
  );

  it.skipIf(!process.env.DISCOVERY_TEST_NEO4J_URL)(
    'hydrates real graph mutual candidates against current PostgreSQL permissions and marks projection gaps',
    async () => {
      const graph = new GraphClient(
        new ConfigService({
          NEO4J_HTTP_URL: process.env.DISCOVERY_TEST_NEO4J_URL,
          NEO4J_PASSWORD:
            process.env.DISCOVERY_TEST_NEO4J_PASSWORD ?? 'test-only-unused',
        }),
      );
      try {
        await friend(a, c);
        await friend(b, c);
        for (const id of [a, b, c]) {
          await graph.account(id, 300, 'active');
          await graph.apply({
            eventType: 'USER_PROFILE_SNAPSHOT',
            version: 1,
            userId: id,
            profileVersion: 300,
            username: `mut_${ids.indexOf(id)}`,
            displayNameNorm: 'mutual',
            recommendable: true,
            mutualVisibility: true,
          });
        }
        for (const [x, y] of [
          [a, c],
          [b, c],
        ])
          await graph.apply({
            eventType: 'PAIR_STATE_SNAPSHOT',
            version: 1,
            lowId: [x!, y!].sort()[0],
            highId: [x!, y!].sort()[1],
            pairVersion: 300,
            friends: true,
            requestedBy: null,
            lowBlocksHigh: false,
            highBlocksLow: false,
          });
        const candidates = await graph.mutualCandidates(a, [b]);
        expect(candidates[b]).toContain(c);
        expect(
          await repo.mutual(a, b, 20, undefined, candidates[b]),
        ).toMatchObject({ state: 'available', count: 1, partial: false });
        await repo.setPrivacy(c, { mutualVisibility: false });
        expect(
          await repo.mutual(a, b, 20, undefined, candidates[b]),
        ).toMatchObject({ count: 0, data: [] });
        await repo.setPrivacy(c, { mutualVisibility: true });
        expect(await repo.mutual(a, b, 20, undefined, [])).toMatchObject({
          count: 1,
          data: [],
          partial: true,
        });
      } finally {
        await graph.query('MATCH (u:User) WHERE u.id IN $ids DETACH DELETE u', {
          ids,
        });
        await graph.query(
          "MATCH (w:PairWatermark) WHERE split(w.pairKey,':')[0] IN $ids DELETE w",
          { ids },
        );
      }
    },
  );

  it.skipIf(
    !process.env.DISCOVERY_TEST_KAFKA_BROKERS ||
      !process.env.DISCOVERY_TEST_NEO4J_URL ||
      !process.env.DISCOVERY_TEST_REDIS_URL,
  )(
    'publishes and consumes private graph/account topics, monitors catch-up, and serves a recomputed Redis list',
    async () => {
      const kafka = new Kafka({
        clientId: 'discovery-verification',
        brokers: process.env.DISCOVERY_TEST_KAFKA_BROKERS!.split(','),
        logLevel: logLevel.NOTHING,
      });
      const admin = kafka.admin(),
        producer = kafka.producer();
      const suffix = randomUUID();
      const graphTopic = `discovery-graph-${suffix}`,
        accountTopic = `discovery-account-${suffix}`;
      const redis = new Redis(process.env.DISCOVERY_TEST_REDIS_URL!);
      const graph = new GraphClient(
        new ConfigService({
          NEO4J_HTTP_URL: process.env.DISCOVERY_TEST_NEO4J_URL,
          NEO4J_PASSWORD:
            process.env.DISCOVERY_TEST_NEO4J_PASSWORD ?? 'test-only-unused',
        }),
      );
      const runtime = new DiscoveryRuntime(
        new ConfigService({
          NODE_ENV: 'test',
          KAFKA_BROKERS: process.env.DISCOVERY_TEST_KAFKA_BROKERS,
          SOCIAL_GRAPH_EVENTS_TOPIC: graphTopic,
          ACCOUNT_EVENTS_TOPIC: accountTopic,
          GRAPH_CONSUMER_GROUP: `discovery-test-${suffix}`,
        }),
        graph,
        db,
        redis,
      );
      try {
        await admin.connect();
        await producer.connect();
        await admin.createTopics({
          topics: [
            { topic: accountTopic, numPartitions: 2, replicationFactor: 1 },
            { topic: graphTopic, numPartitions: 3, replicationFactor: 1 },
          ],
          waitForLeaders: true,
        });
        await friend(a, b);
        await friend(b, c);
        await producer.send({
          topic: accountTopic,
          messages: ids.map((id) => ({
            key: id,
            value: JSON.stringify({
              eventType: 'ACCOUNT_CHANGED',
              aggregateId: id,
              version: 2,
              data: { id, version: 2, status: 'active' },
            }),
          })),
        });
        for (let i = 0; i < 20; i++) {
          await runtime.tick();
          await runtime.refresh();
          if (runtime.fresh && (await runtime.cache(a))) break;
          await new Promise((resolve) => setTimeout(resolve, 250));
        }
        expect(runtime.fresh).toBe(true);
        expect(runtime.graphAvailable).toBe(true);
        expect((await runtime.cache(a))?.ids).toContain(c);
        expect(
          (
            await db.query(
              'SELECT count(*)::int AS n FROM graph_outbox WHERE published_at IS NULL',
            )
          )[0].n,
        ).toBe(0);
        expect(
          (
            await db.query(
              'SELECT DISTINCT topic FROM graph_projection_offsets',
            )
          )
            .map((r) => r.topic)
            .sort(),
        ).toEqual([accountTopic, graphTopic].sort());
      } finally {
        await runtime.onModuleDestroy();
        await producer.disconnect();
        await admin
          .deleteGroups([`discovery-test-${suffix}`])
          .catch(() => undefined);
        await admin.deleteTopics({ topics: [graphTopic, accountTopic] });
        await admin.disconnect();
        for (const id of ids)
          await redis.del(`rec:${id}`, `rec:gen:${id}`, `rec:lock:${id}`);
        await redis.quit();
        await graph.query('MATCH (u:User) WHERE u.id IN $ids DETACH DELETE u', {
          ids,
        });
        await graph.query(
          "MATCH (w:PairWatermark) WHERE split(w.pairKey,':')[0] IN $ids DELETE w",
          { ids },
        );
      }
    },
    60000,
  );

  it.skipIf(!process.env.DISCOVERY_TEST_REDIS_URL)(
    'atomically rejects stale Redis generations and admits safe key-reset publication',
    async () => {
      const redis = new Redis(process.env.DISCOVERY_TEST_REDIS_URL!);
      try {
        await redis.set(`rec:gen:${a}`, '2');
        expect(
          await redis.eval(
            PUBLISH_RECOMMENDATIONS,
            2,
            `rec:gen:${a}`,
            `rec:${a}`,
            '1',
            'old',
            '600',
          ),
        ).toBe(0);
        expect(await redis.get(`rec:${a}`)).toBeNull();
        await redis.del(`rec:gen:${a}`);
        expect(
          await redis.eval(
            PUBLISH_RECOMMENDATIONS,
            2,
            `rec:gen:${a}`,
            `rec:${a}`,
            '0',
            'old',
            '600',
          ),
        ).toBe(1);
        await social.block(a, b);
        expect(await recommended(a, await recSession(a, [b]))).toEqual([]);
      } finally {
        await redis.del(`rec:gen:${a}`, `rec:${a}`);
        await redis.quit();
      }
    },
  );
});
