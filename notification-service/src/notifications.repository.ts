import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { createHash } from 'node:crypto';
import { CursorCodec } from './cursor.js';
import type { SocialEvent } from './event.js';
export interface NotificationRow {
  id: string;
  type: string;
  actor: Record<string, unknown>;
  data: Record<string, unknown>;
  createdAt: string;
  readAt: string | null;
  inboxSequence: string;
  isSeen: boolean;
  isRead: boolean;
}
@Injectable()
export class NotificationsRepository {
  constructor(
    private readonly db: DataSource,
    private readonly cursors: CursorCodec,
  ) {}
  async ingest(e: SocialEvent): Promise<void> {
    if (Date.parse(e.timestamp) < Date.now() - 90 * 86400000) return;
    await this.db.transaction(async (m) => {
      const inserted = await m.query(
        `INSERT INTO notification_dedupe(event_id,recipient_id,type) VALUES($1,$2,$3) ON CONFLICT DO NOTHING RETURNING event_id`,
        [e.eventId, e.data.recipientId, e.eventType],
      );
      if (!inserted.length) return;
      await m.query(
        'INSERT INTO inbox_state(recipient_id) VALUES($1) ON CONFLICT DO NOTHING',
        [e.data.recipientId],
      );
      const [state] = await m.query(
        'WITH s AS (UPDATE inbox_state SET latest_sequence=latest_sequence+1 WHERE recipient_id=$1 RETURNING latest_sequence) SELECT * FROM s',
        [e.data.recipientId],
      );
      const [n] = await m.query(
        `INSERT INTO notifications(event_id,recipient_id,inbox_sequence,type,actor,data,occurred_at) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
        [
          e.eventId,
          e.data.recipientId,
          state.latest_sequence,
          e.eventType,
          JSON.stringify(e.data.actor),
          JSON.stringify({ friendRequestId: e.aggregateId }),
          e.timestamp,
        ],
      );
      await m.query(
        `INSERT INTO push_jobs(notification_id,installation_id,session_id,token_hash,expires_at)
 SELECT $1,installation_id,session_id,token_hash,$3::timestamptz+interval '24 hours' FROM push_devices WHERE recipient_id=$2
 AND $3::timestamptz+interval '24 hours'>now()`,
        [n.id, e.data.recipientId, e.timestamp],
      );
    });
  }
  async list(user: string, limit: number, cursor?: string) {
    const c = cursor ? this.cursors.decode(user, 'page', cursor) : null;
    if (c && (!c.createdAt || !c.id))
      throw new BadRequestException('Invalid page cursor');
    return this.db.transaction('REPEATABLE READ', async (m) => {
      const [state] = await m.query(
        'SELECT latest_sequence,last_seen_sequence FROM inbox_state WHERE recipient_id=$1',
        [user],
      );
      const rows: NotificationRow[] = await m.query(
        `SELECT n.id,n.type,n.actor,n.data,n.created_at::text AS "createdAt",n.read_at AS "readAt",n.inbox_sequence AS "inboxSequence",
 (n.read_at IS NOT NULL) AS "isRead",(n.inbox_sequence<=$2::bigint OR n.read_at IS NOT NULL) AS "isSeen"
 FROM notifications n WHERE n.recipient_id=$1 AND n.expires_at>now()
 ${c ? 'AND (n.created_at,n.id)<($4::timestamptz,$5::uuid)' : ''}
 ORDER BY n.created_at DESC,n.id DESC LIMIT $3`,
        [
          user,
          state?.last_seen_sequence ?? '0',
          limit + 1,
          ...(c ? [c.createdAt, c.id] : []),
        ],
      );
      const items = rows.slice(0, limit),
        last = items.at(-1);
      return {
        items,
        pageInfo: {
          hasMore: rows.length > limit,
          nextCursor:
            rows.length > limit && last
              ? this.cursors.sign(user, 'page', {
                  createdAt: last.createdAt,
                  id: last.id,
                })
              : null,
        },
        seenCursor: !c
          ? this.cursors.sign(user, 'seen', {
              sequence: state?.latest_sequence ?? '0',
            })
          : null,
      };
    });
  }
  async seen(user: string, cursor: string) {
    const { sequence } = this.cursors.decode(user, 'seen', cursor);
    if (!/^(0|[1-9][0-9]{0,18})$/.test(sequence ?? ''))
      throw new BadRequestException('Invalid seen marker');
    await this.db.query(
      `INSERT INTO inbox_state(recipient_id) VALUES($1) ON CONFLICT DO NOTHING`,
      [user],
    );
    await this.db.query(
      `UPDATE inbox_state SET last_seen_sequence=GREATEST(last_seen_sequence,LEAST(latest_sequence,$2::bigint)),
 last_seen_at=CASE WHEN $2::bigint>=last_seen_sequence THEN now() ELSE last_seen_at END WHERE recipient_id=$1`,
      [user, sequence],
    );
    return this.counts(user);
  }
  async counts(user: string) {
    const [row] = await this.db.query(
      `SELECT
 count(*) FILTER(WHERE n.inbox_sequence>COALESCE(s.last_seen_sequence,0))::integer AS "unseenCount",
 count(*)::integer AS "unreadCount" FROM notifications n LEFT JOIN inbox_state s ON s.recipient_id=n.recipient_id
 WHERE n.recipient_id=$1 AND n.expires_at>now() AND n.read_at IS NULL`,
      [user],
    );
    return row;
  }
  async read(user: string, id: string) {
    const [row] = await this.db.query(
      `WITH r AS (UPDATE notifications SET read_at=COALESCE(read_at,now())
 WHERE id=$1 AND recipient_id=$2 AND expires_at>now() RETURNING id,read_at) SELECT id,read_at AS "readAt",true AS "isRead",true AS "isSeen" FROM r`,
      [id, user],
    );
    if (!row) throw new NotFoundException('Notification not found');
    return row;
  }
  async register(
    user: string,
    session: string,
    installation: string,
    token: string,
    platform: string,
  ) {
    const hash = createHash('sha256').update(token).digest('hex');
    // A new login may move this installation/token to its current verified session.
    await this.db.transaction(async (m) => {
      await m.query(
        'DELETE FROM push_devices WHERE token=$1 AND installation_id<>$2',
        [token, installation],
      );
      await m.query(
        `INSERT INTO push_devices(installation_id,recipient_id,session_id,token,token_hash,platform) VALUES($1,$2,$3,$4,$5,$6)
 ON CONFLICT(installation_id) DO UPDATE SET recipient_id=$2,session_id=$3,token=$4,token_hash=$5,platform=$6,updated_at=now()`,
        [installation, user, session, token, hash, platform],
      );
    });
    return { registered: true };
  }
  async unregister(user: string, session: string, installation: string) {
    await this.db.query(
      'DELETE FROM push_devices WHERE installation_id=$1 AND recipient_id=$2 AND session_id=$3',
      [installation, user, session],
    );
    return { registered: false };
  }
  async cleanup() {
    await this.db.query(
      `DELETE FROM notifications WHERE id IN(SELECT id FROM notifications WHERE expires_at<=now() LIMIT 500)`,
    );
    await this.db.query(
      `DELETE FROM notification_dedupe WHERE created_at<now()-interval '180 days'`,
    );
    await this.db.query(
      `DELETE FROM notification_quarantine WHERE created_at<now()-interval '30 days'`,
    );
    await this.db.query(
      `DELETE FROM push_jobs WHERE finished_at<now()-interval '7 days'`,
    );
  }
}
