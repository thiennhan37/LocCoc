import { normalizeSearchQuery } from './search-query.js';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { isUUID } from 'class-validator';
import {
  safeColumns,
  relations,
  visible,
  type SafeProfile,
} from '../social/social.repository.js';
import type { GraphCandidate } from './graph.client.js';

export interface Privacy {
  recommendable: boolean;
  mutualVisibility: boolean;
}
export interface MutualEvidence {
  state: 'available' | 'hidden' | 'unavailable';
  count: number | null;
  data: SafeProfile[];
}
export type DiscoveryProfile = SafeProfile & { mutual?: MutualEvidence };

const textMatch = `(u.username=$2 OR u.username LIKE $3 ESCAPE E'\\\\'
  OR u.display_name_norm LIKE $4 ESCAPE E'\\\\' OR u.display_name_norm % $2)`;
const recommendationEligible = `u.recommendable AND f.id IS NULL AND r.id IS NULL
  AND NOT EXISTS(SELECT 1 FROM suggestion_feedback sf WHERE sf.viewer_id=$1 AND sf.target_id=u.id AND sf.expires_at>clock_timestamp())`;
const mutualVisible = `w.username IS NOT NULL AND w.deleted_at IS NULL AND w.account_status='active'
  AND w.mutual_friends_visibility AND w.id<>$1 AND w.id<>$2
  AND NOT EXISTS(SELECT 1 FROM user_blocks b WHERE
    (b.blocker_id=w.id AND b.blocked_id IN ($1,$2)) OR (b.blocked_id=w.id AND b.blocker_id IN ($1,$2)))`;
const intersection = `FROM users w
  JOIN friendships fa ON fa.user_low_id=LEAST($1::uuid,w.id) AND fa.user_high_id=GREATEST($1::uuid,w.id)
  JOIN friendships fb ON fb.user_low_id=LEAST($2::uuid,w.id) AND fb.user_high_id=GREATEST($2::uuid,w.id)
  WHERE ${mutualVisible}`;

@Injectable()
export class DiscoveryRepository {
  constructor(@Optional() readonly db?: DataSource) {}
  async privacy(id: string): Promise<Privacy> {
    const rows: Privacy[] = await this.db!.query(
      `SELECT recommendable,mutual_friends_visibility AS "mutualVisibility"
      FROM users WHERE id=$1 AND deleted_at IS NULL AND account_status='active'`,
      [id],
    );
    if (!rows[0]) throw new NotFoundException('User not found');
    return rows[0];
  }
  async setPrivacy(id: string, patch: Partial<Privacy>) {
    await this.db!.query(
      `UPDATE users SET recommendable=COALESCE($2,recommendable),
      mutual_friends_visibility=COALESCE($3,mutual_friends_visibility),updated_at=clock_timestamp()
      WHERE id=$1 AND deleted_at IS NULL AND account_status='active'`,
      [id, patch.recommendable, patch.mutualVisibility],
    );
    return this.privacy(id);
  }
  async dismiss(id: string, target: string) {
    const rows = await this.db!.query(
      `SELECT u.id FROM users u ${relations} WHERE ${visible} AND u.id=$2`,
      [id, target],
    );
    if (!rows.length) throw new NotFoundException('User not found');
    await this.db!.query(
      `INSERT INTO suggestion_feedback(viewer_id,target_id,reason,expires_at)
      VALUES($1,$2,'DISMISS',clock_timestamp()+interval '90 days')
      ON CONFLICT(viewer_id,target_id,reason) DO UPDATE SET expires_at=EXCLUDED.expires_at,created_at=clock_timestamp()
      WHERE suggestion_feedback.expires_at<=clock_timestamp()`,
      [id, target],
    );
  }
  async normalize(query: string): Promise<string> {
    const [row]: { value: string }[] = await this.db!.query(
      'SELECT lower(public.unaccent($1)) AS value',
      [normalizeSearchQuery(query)],
    );
    return row!.value;
  }
  private terms(term: string) {
    const escaped = term.replace(/[\\%_]/g, '\\$&');
    return [term, `${escaped}%`, `%${escaped}%`];
  }
  async globalSearchIds(id: string, term: string): Promise<string[]> {
    const rows: { id: string }[] = await this.db!.query(
      `SELECT u.id FROM users u
      WHERE ${visible} AND ${textMatch}
      ORDER BY (u.username=$2) DESC,(u.display_name_norm=$2) DESC,
        similarity(u.display_name_norm,$2) DESC,u.username,u.id LIMIT 500`,
      [id, ...this.terms(term)],
    );
    return rows.map((row) => row.id);
  }
  // Compatibility helper for internal callers; HTTP retrieval calls the two
  // explicit stages so the text index is scanned only once.
  async searchIds(
    id: string,
    term: string,
    graph: GraphCandidate[],
  ): Promise<string[]> {
    return this.rankSearchIds(
      id,
      term,
      await this.globalSearchIds(id, term),
      graph,
    );
  }
  async rankSearchIds(
    id: string,
    term: string,
    globalIds: string[],
    graph: GraphCandidate[],
  ): Promise<string[]> {
    const candidates: { id: string }[] = await this.db!.query(
      `WITH ids AS (SELECT unnest($7::uuid[]) AS id UNION SELECT unnest($5::uuid[])),
      distances AS (SELECT * FROM unnest($5::uuid[],$6::int[]) AS d(id,distance))
      SELECT u.id FROM ids JOIN users u USING(id) ${relations}
      LEFT JOIN distances d ON d.id=u.id WHERE ${visible} AND ${textMatch}
      ORDER BY CASE WHEN u.username=$2 THEN 0 WHEN u.display_name_norm=$2 THEN 1
        WHEN u.display_name_norm LIKE $3 ESCAPE E'\\\\' THEN 2
        WHEN u.username LIKE $3 ESCAPE E'\\\\' THEN 2
        WHEN u.display_name_norm LIKE $4 ESCAPE E'\\\\' THEN 3 ELSE 4 END,
        similarity(u.display_name_norm,$2) DESC,COALESCE(d.distance,999),u.username,u.id LIMIT 500`,
      [
        id,
        ...this.terms(term),
        graph.map((g) => g.id),
        graph.map((g) => g.distance),
        globalIds,
      ],
    );
    return candidates.map((c) => c.id);
  }
  async createSession(
    id: string,
    query: string,
    ids: string[],
    degraded: boolean,
  ): Promise<string> {
    const [row]: { id: string }[] = await this.db!.query(
      `INSERT INTO discovery_search_sessions(viewer_id,query,candidates,degraded)
      VALUES($1,$2,$3,$4) RETURNING id`,
      [id, query, ids.slice(0, 500), degraded],
    );
    return `${row!.id}:0`;
  }
  async page(
    id: string,
    query: string,
    cursor: string,
    limit: number,
    recommendations = false,
  ) {
    if (!/^[0-9a-f-]{36}:\d{1,3}$/.test(cursor))
      throw new BadRequestException('Invalid cursor');
    const [sessionId, offsetString] = cursor.split(':');
    if (!isUUID(sessionId)) throw new BadRequestException('Invalid cursor');
    const offset = Number(offsetString);
    const [session]: { candidates: string[]; degraded: boolean }[] =
      await this.db!.query(
        `SELECT candidates,degraded
      FROM discovery_search_sessions WHERE id=$1 AND viewer_id=$2 AND query=$3 AND expires_at>clock_timestamp()`,
        [sessionId, id, query],
      );
    if (!session || offset > session.candidates.length)
      throw new BadRequestException({
        code: 'DISCOVERY_CURSOR_EXPIRED',
        message: 'Restart this search',
      });
    const rows: (DiscoveryProfile & { position: number })[] =
      await this.db!.query(
        `SELECT ${safeColumns},i.position::int
      FROM unnest($5::uuid[]) WITH ORDINALITY AS i(id,position) JOIN users u ON u.id=i.id ${relations}
      WHERE ${visible} AND $2::text IS NOT NULL AND $3::text IS NOT NULL AND $4::text IS NOT NULL
        AND i.position>$6 AND ${recommendations ? recommendationEligible : textMatch}
      ORDER BY i.position LIMIT $7`,
        [id, ...this.terms(query), session.candidates, offset, limit + 1],
      );
    const shown = rows.slice(0, limit);
    return {
      data: shown.map(({ position: _position, ...profile }) => profile),
      hasMore: rows.length > limit,
      nextCursor:
        rows.length > limit ? `${sessionId}:${shown.at(-1)!.position}` : null,
      degraded: session.degraded,
    };
  }
  async mutual(
    id: string,
    target: string,
    limit = 3,
    after?: string,
    graphIds?: string[],
  ): Promise<
    MutualEvidence & {
      hasMore: boolean;
      nextCursor: string | null;
      partial?: boolean;
    }
  > {
    return this.db!.transaction('REPEATABLE READ', async (m) => {
      const rows: { mutual_friends_visibility: boolean }[] = await m.query(
        `SELECT u.mutual_friends_visibility
        FROM users u ${relations} WHERE ${visible} AND u.id=$2`,
        [id, target],
      );
      if (!rows[0]) throw new NotFoundException('User not found');
      if (!rows[0].mutual_friends_visibility)
        return {
          state: 'hidden',
          count: null,
          data: [],
          hasMore: false,
          nextCursor: null,
        };
      const [{ count, verified }]: { count: number; verified: number }[] =
        await m.query(
          `SELECT count(*)::int AS count,
        count(*) FILTER(WHERE $3::uuid[] IS NULL OR w.id=ANY($3))::int AS verified ${intersection}`,
          [id, target, graphIds ?? null],
        );
      const data: SafeProfile[] = await m.query(
        `SELECT w.id,w.username,w.display_name AS "displayName",w.avatar_url AS "avatarUrl",w.cover_url AS "coverUrl",
        'FRIENDS' AS "relationshipStatus",NULL AS "friendRequestId" ${intersection}
        AND ($3::uuid IS NULL OR w.id>$3) AND ($5::uuid[] IS NULL OR w.id=ANY($5))
        ORDER BY w.id LIMIT $4`,
        [id, target, after ?? null, limit + 1, graphIds ?? null],
      );
      return {
        state: 'available',
        count: count!,
        data: data.slice(0, limit),
        hasMore: data.length > limit,
        nextCursor: data.length > limit ? data[limit - 1]!.id : null,
        partial: count! > verified!,
      };
    });
  }
  async enqueue(id: string, priority = 2) {
    await this.db!.query('SELECT request_discovery_refresh($1,$2::smallint)', [
      id,
      priority,
    ]);
  }
}
