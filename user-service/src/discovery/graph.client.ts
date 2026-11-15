import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { isUUID } from 'class-validator';

export interface PairSnapshot {
  eventType: 'PAIR_STATE_SNAPSHOT';
  version: 1;
  lowId: string;
  highId: string;
  pairVersion: number;
  friends: boolean;
  requestedBy: string | null;
  lowBlocksHigh: boolean;
  highBlocksLow: boolean;
}
export interface ProfileSnapshot {
  eventType: 'USER_PROFILE_SNAPSHOT';
  version: 1;
  userId: string;
  profileVersion: number;
  username: string | null;
  displayNameNorm: string;
  recommendable: boolean;
  mutualVisibility: boolean;
}
export type GraphSnapshot = PairSnapshot | ProfileSnapshot;
export interface GraphCandidate {
  id: string;
  distance: number;
  score: number;
}

export function parseGraphSnapshot(
  input: unknown,
  key?: string,
): GraphSnapshot {
  if (!input || typeof input !== 'object')
    throw new Error('Invalid graph event');
  const e = input as Record<string, unknown>;
  const positive = (n: unknown) =>
    typeof n === 'number' && Number.isSafeInteger(n) && n > 0;
  if (e.version !== 1) throw new Error('Unsupported graph event');
  if (
    e.eventType === 'PAIR_STATE_SNAPSHOT' &&
    typeof e.lowId === 'string' &&
    isUUID(e.lowId) &&
    typeof e.highId === 'string' &&
    isUUID(e.highId) &&
    e.lowId < e.highId &&
    positive(e.pairVersion) &&
    typeof e.friends === 'boolean' &&
    typeof e.lowBlocksHigh === 'boolean' &&
    typeof e.highBlocksLow === 'boolean' &&
    (e.requestedBy === null ||
      e.requestedBy === e.lowId ||
      e.requestedBy === e.highId) &&
    (key === undefined || key === `${e.lowId}:${e.highId}`)
  )
    return e as unknown as PairSnapshot;
  if (
    e.eventType === 'USER_PROFILE_SNAPSHOT' &&
    typeof e.userId === 'string' &&
    isUUID(e.userId) &&
    positive(e.profileVersion) &&
    (e.username === null ||
      (typeof e.username === 'string' &&
        /^[a-z0-9_]{2,30}$/.test(e.username))) &&
    typeof e.displayNameNorm === 'string' &&
    e.displayNameNorm.length <= 1024 &&
    typeof e.recommendable === 'boolean' &&
    typeof e.mutualVisibility === 'boolean' &&
    (key === undefined || key === e.userId)
  )
    return e as unknown as ProfileSnapshot;
  throw new Error('Invalid graph event');
}

@Injectable()
export class GraphClient {
  constructor(private readonly config: ConfigService) {}

  async query<T extends object = Record<string, unknown>>(
    statement: string,
    parameters: Record<string, unknown> = {},
  ): Promise<T[]> {
    const endpoint = new URL(
      '/db/neo4j/tx/commit',
      this.config.get<string>('NEO4J_HTTP_URL', 'http://127.0.0.1:7474'),
    );
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Basic ${Buffer.from(
          `${this.config.get<string>('NEO4J_USER', 'neo4j')}:${this.config.getOrThrow<string>('NEO4J_PASSWORD')}`,
        ).toString('base64')}`,
      },
      body: JSON.stringify({ statements: [{ statement, parameters }] }),
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) throw new Error('Graph unavailable');
    const body = (await response.json()) as {
      errors: { code: string }[];
      results: { columns: string[]; data: { row: unknown[] }[] }[];
    };
    if (body.errors?.length || !body.results?.[0])
      throw new Error(
        `Graph query failed (${body.errors?.[0]?.code ?? 'invalid-response'})`,
      );
    const result = body.results[0];
    return result.data.map(
      ({ row }) =>
        Object.fromEntries(
          result.columns.map((name, i) => [name, row[i]]),
        ) as T,
    );
  }

  async initialize() {
    await this.query(
      'CREATE CONSTRAINT discovery_user_id IF NOT EXISTS FOR (u:User) REQUIRE u.id IS UNIQUE',
    );
    await this.query(
      'CREATE CONSTRAINT discovery_pair_key IF NOT EXISTS FOR (w:PairWatermark) REQUIRE w.pairKey IS UNIQUE',
    );
  }

  async apply(input: unknown, key?: string) {
    const e = parseGraphSnapshot(input, key);
    if (e.eventType === 'USER_PROFILE_SNAPSHOT') {
      await this.query(
        `MERGE (u:User {id:$userId})
        SET u._lock=coalesce(u._lock,0)+1
        WITH u WHERE coalesce(u.profileVersion,0)<$profileVersion
        SET u.profileVersion=$profileVersion,u.username=$username,u.displayNameNorm=$displayNameNorm,
          u.recommendable=$recommendable,u.mutualVisibility=$mutualVisibility`,
        { ...e },
      );
    } else {
      await this.query(
        `MERGE (w:PairWatermark {pairKey:$pairKey})
        SET w._lock=coalesce(w._lock,0)+1
        WITH w WHERE coalesce(w.lastVersion,0)<$pairVersion
        MERGE (a:User {id:$lowId}) MERGE (b:User {id:$highId})
        WITH w,a,b OPTIONAL MATCH (a)-[r:FRIEND|REQUESTED|BLOCKED]-(b)
        DELETE r WITH DISTINCT w,a,b
        FOREACH (_ IN CASE WHEN $friends THEN [1] ELSE [] END | CREATE (a)-[:FRIEND]->(b))
        FOREACH (_ IN CASE WHEN $requestedBy=$lowId THEN [1] ELSE [] END | CREATE (a)-[:REQUESTED]->(b))
        FOREACH (_ IN CASE WHEN $requestedBy=$highId THEN [1] ELSE [] END | CREATE (b)-[:REQUESTED]->(a))
        FOREACH (_ IN CASE WHEN $lowBlocksHigh THEN [1] ELSE [] END | CREATE (a)-[:BLOCKED]->(b))
        FOREACH (_ IN CASE WHEN $highBlocksLow THEN [1] ELSE [] END | CREATE (b)-[:BLOCKED]->(a))
        SET w.lastVersion=$pairVersion`,
        { ...e, pairKey: `${e.lowId}:${e.highId}` },
      );
    }
    return e;
  }

  async account(id: string, accountVersion: number, status: string) {
    if (
      !isUUID(id) ||
      !Number.isSafeInteger(accountVersion) ||
      accountVersion < 1 ||
      !['active', 'suspended', 'pending_verification', 'deleted'].includes(
        status,
      )
    )
      throw new Error('Invalid graph account');
    await this.query(
      `MERGE (u:User {id:$id}) SET u._lock=coalesce(u._lock,0)+1
      WITH u WHERE coalesce(u.accountVersion,0)<$accountVersion
      SET u.accountVersion=$accountVersion,u.status=$status`,
      { id, accountVersion, status },
    );
  }

  async mutualCandidates(
    id: string,
    targets: string[],
  ): Promise<Record<string, string[]>> {
    const rows = await this.query<{ target: string; ids: string[] }>(
      `UNWIND $targets AS target
      MATCH (b:User {id:target})
      OPTIONAL MATCH (a:User {id:$id})-[:FRIEND]-(w:User)-[:FRIEND]-(b)
      WHERE b.mutualVisibility=true AND w.status='active' AND w.mutualVisibility=true
        AND w.username IS NOT NULL AND NOT EXISTS { MATCH (a)-[:BLOCKED]-(w) }
        AND NOT EXISTS { MATCH (b)-[:BLOCKED]-(w) }
      WITH target,w ORDER BY w.id
      RETURN target,collect(DISTINCT w.id)[0..500] AS ids`,
      { id, targets: targets.slice(0, 50) },
    );
    return Object.fromEntries(rows.map((row) => [row.target, row.ids]));
  }

  async candidates(id: string, term?: string): Promise<GraphCandidate[]> {
    const query = (depth: string, limit: number, excluded: string[] = []) =>
      this.query<GraphCandidate>(
        `MATCH (a:User {id:$id}) MATCH p=(a)-[:FRIEND*${depth}]-(u:User)
       WHERE u<>a AND u.status='active' AND u.username IS NOT NULL
         AND NOT u.id IN $excluded AND NOT EXISTS { MATCH (a)-[:BLOCKED]-(u) }
         AND all(w IN nodes(p)[1..-1] WHERE w.status='active' AND w.mutualVisibility=true
           AND NOT EXISTS { MATCH (a)-[:BLOCKED]-(w) })
         ${
           term !== undefined
             ? 'AND (u.displayNameNorm CONTAINS $term OR u.username STARTS WITH $term)'
             : `AND u.recommendable=true AND NOT EXISTS { MATCH (a)-[:FRIEND|REQUESTED]-(u) }`
         }
       WITH u,min(length(p)) AS distance,${depth === '2' ? 'count(DISTINCT nodes(p)[1])' : 'count(p)'} AS score
       RETURN u.id AS id,distance,score ORDER BY distance,score DESC,id LIMIT $limit`,
        { id, term: term ?? '', excluded, limit },
      );
    if (term !== undefined) return query('1..2', 500);
    // Longer paths must never inflate a two-hop candidate's common-friend score.
    const twoHop = await query('2', 500);
    if (twoHop.length === 500) return twoHop;
    const threeHop = await query(
      '3',
      500 - twoHop.length,
      twoHop.map((c) => c.id),
    );
    return [...twoHop, ...threeHop];
  }
}
