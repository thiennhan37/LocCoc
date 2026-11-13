import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { isUUID } from 'class-validator';
import { DataSource } from 'typeorm';
import type { ListSessionsDto } from './dto/list-sessions.dto.js';

export interface SessionRow {
  id: string;
  platform: string | null;
  userAgent: string | null;
  ip: string | null;
  createdAt: string;
  lastUsedAt: string;
  expiresAt: string;
  revokedAt: string | null;
  status: 'ACTIVE' | 'REVOKED' | 'EXPIRED';
}
interface SessionCursor {
  v: 1;
  owner: string;
  at: string;
  id: string;
  kind?: 'active' | 'history';
}

@Injectable()
export class SessionManagementRepository {
  constructor(private readonly db: DataSource) {}

  private cursor(
    owner: string,
    value: string,
    kind: 'active' | 'history',
  ): SessionCursor {
    try {
      const c: unknown = JSON.parse(
        Buffer.from(value, 'base64url').toString('utf8'),
      );
      if (!c || typeof c !== 'object' || Array.isArray(c)) throw Error();
      const row = c as Record<string, unknown>;
      if (
        row.v !== 1 ||
        row.owner !== owner ||
        (row.kind ?? 'active') !== kind ||
        typeof row.at !== 'string' ||
        !/^\d{4}-\d{2}-\d{2}[ T](?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,6})?(?:Z|[+-](?:0\d|1[0-4])(?::?[0-5]\d)?)$/.test(
          row.at,
        ) ||
        row.at.startsWith('0000') ||
        !Number.isFinite(Date.parse(row.at)) ||
        new Date(`${row.at.slice(0, 10)}T00:00:00Z`)
          .toISOString()
          .slice(0, 10) !== row.at.slice(0, 10) ||
        typeof row.id !== 'string' ||
        !isUUID(row.id)
      )
        throw Error();
      return row as unknown as SessionCursor;
    } catch {
      throw new BadRequestException('Invalid session cursor');
    }
  }

  async list(owner: string, query: ListSessionsDto) {
    return this.page(owner, query, 'active');
  }

  async history(owner: string, query: ListSessionsDto) {
    return this.page(owner, query, 'history');
  }

  private async page(
    owner: string,
    query: ListSessionsDto,
    kind: 'active' | 'history',
  ) {
    const c = query.cursor ? this.cursor(owner, query.cursor, kind) : null;
    const column = kind === 'history' ? 'session_id' : 'id';
    const table = kind === 'history' ? 'login_history' : 'sessions';
    const rows: SessionRow[] = await this.db.query(
      `SELECT ${column} AS id,device_info->>'platform' AS platform,device_info->>'userAgent' AS "userAgent",
       host(ip) AS ip,created_at::text AS "createdAt",last_used_at::text AS "lastUsedAt",expires_at::text AS "expiresAt",
       revoked_at::text AS "revokedAt",CASE WHEN revoked_at IS NOT NULL THEN 'REVOKED'
         WHEN expires_at<=now() THEN 'EXPIRED' ELSE 'ACTIVE' END AS status
       FROM ${table} WHERE user_id=$1 AND ${
         kind === 'history'
           ? "(created_at>now()-interval '90 days' OR (revoked_at IS NULL AND expires_at>now()))"
           : 'revoked_at IS NULL AND expires_at>now()'
       }
       ${c ? `AND (created_at,${column})<($3::timestamptz,$4::uuid)` : ''}
       ORDER BY created_at DESC,${column} DESC LIMIT $2`,
      [owner, query.limit + 1, ...(c ? [c.at, c.id] : [])],
    );
    const items = rows.slice(0, query.limit),
      last = items.at(-1);
    return {
      items,
      pageInfo: {
        hasMore: rows.length > query.limit,
        nextCursor:
          rows.length > query.limit && last
            ? Buffer.from(
                JSON.stringify({
                  v: 1,
                  owner,
                  at: last.createdAt,
                  id: last.id,
                  kind,
                } satisfies SessionCursor),
              ).toString('base64url')
            : null,
      },
    };
  }

  async revoke(
    owner: string,
    id: string,
  ): Promise<{ sessionId: string; revoked: boolean }> {
    return this.db.transaction(async (manager) => {
      const rows: { id: string; active: boolean }[] = await manager.query(
        `SELECT id,(revoked_at IS NULL AND expires_at>clock_timestamp()) AS active
         FROM sessions WHERE user_id=$1 AND id=$2 FOR UPDATE`,
        [owner, id],
      );
      const row = rows[0];
      if (!row) throw new NotFoundException('Session not found');
      if (!row.active) return { sessionId: row.id, revoked: false };
      await manager.query(
        'UPDATE sessions SET revoked_at=clock_timestamp() WHERE user_id=$1 AND id=$2',
        [owner, row.id],
      );
      await manager.query(
        `UPDATE refresh_tokens SET revoked_at=clock_timestamp()
        WHERE user_id=$1 AND session_id=$2 AND revoked_at IS NULL`,
        [owner, row.id],
      );
      return { sessionId: row.id, revoked: true };
    });
  }
}
