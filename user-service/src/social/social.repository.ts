import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import type { AccountSnapshot } from '@loccoc/common';
import type { PageDto } from './social.dto.js';

export interface SafeProfile {
  id: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  relationshipStatus:
    'SELF' | 'NONE' | 'FRIENDS' | 'OUTGOING_PENDING' | 'INCOMING_PENDING';
  friendRequestId: string | null;
}
export interface FriendRequest {
  id: string;
  senderId: string;
  receiverId: string;
  status: 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'CANCELLED';
  createdAt: Date;
  resolvedAt: Date | null;
}
const requestColumns = `id, sender_id AS "senderId", receiver_id AS "receiverId", status,
  created_at AS "createdAt", resolved_at AS "resolvedAt"`;
const safeColumns = `u.id,u.username,u.display_name AS "displayName",u.avatar_url AS "avatarUrl",
  CASE WHEN u.id=$1 THEN 'SELF' WHEN f.id IS NOT NULL THEN 'FRIENDS' WHEN r.sender_id=$1 THEN 'OUTGOING_PENDING'
    WHEN r.receiver_id=$1 THEN 'INCOMING_PENDING' ELSE 'NONE' END AS "relationshipStatus",
  r.id AS "friendRequestId"`;
const relations = `LEFT JOIN friendships f ON f.user_low_id=LEAST($1::uuid,u.id) AND f.user_high_id=GREATEST($1::uuid,u.id)
  LEFT JOIN friend_requests r ON LEAST(r.sender_id,r.receiver_id)=LEAST($1::uuid,u.id)
    AND GREATEST(r.sender_id,r.receiver_id)=GREATEST($1::uuid,u.id) AND r.status='PENDING'`;
const visible = `u.id<>$1 AND u.username IS NOT NULL AND u.deleted_at IS NULL AND u.account_status='active'
  AND NOT EXISTS(SELECT 1 FROM user_blocks b WHERE (b.blocker_id=$1 AND b.blocked_id=u.id)
    OR (b.blocked_id=$1 AND b.blocker_id=u.id))`;

@Injectable()
export class SocialRepository {
  constructor(@Optional() private readonly db?: DataSource) {}

  async project(a: AccountSnapshot): Promise<void> {
    await this.db!.query(
      `INSERT INTO users(id,email,phone,account_status,account_version,deleted_at)
      VALUES($1,$2,$3,$4::varchar,$5,CASE WHEN $4::varchar='deleted' THEN now() ELSE NULL END)
      ON CONFLICT(id) DO UPDATE SET email=EXCLUDED.email, phone=EXCLUDED.phone,
        account_status=EXCLUDED.account_status, account_version=EXCLUDED.account_version,
        deleted_at=CASE WHEN EXCLUDED.account_status='deleted' THEN COALESCE(users.deleted_at,now()) ELSE users.deleted_at END,
        updated_at=now() WHERE users.account_version<EXCLUDED.account_version`,
      [a.id, a.email, a.phone, a.status, a.version],
    );
  }

  async claim(
    id: string,
    username: string,
    displayName?: string,
  ): Promise<void> {
    try {
      const rows: { id: string }[] = await this.db!.query(
        `WITH claimed AS (UPDATE users SET username=$2,
        display_name=COALESCE($3,display_name),updated_at=now()
        WHERE id=$1 AND username IS NULL AND deleted_at IS NULL AND account_status='active' RETURNING id) SELECT * FROM claimed`,
        [id, username, displayName ?? null],
      );
      if (!rows.length)
        throw new ConflictException({
          code: 'USERNAME_ALREADY_SET',
          message: 'Username has already been set',
        });
    } catch (e) {
      if (this.code(e) === '23505')
        throw new ConflictException({
          code: 'USERNAME_TAKEN',
          message: 'Username is already taken',
        });
      throw e;
    }
  }

  async ready(id: string): Promise<void> {
    const rows: { username: string | null; account_status: string }[] =
      await this.db!.query(
        'SELECT username,account_status FROM users WHERE id=$1 AND deleted_at IS NULL',
        [id],
      );
    if (!rows[0] || rows[0].account_status !== 'active')
      throw new ForbiddenException('Account is unavailable');
    if (!rows[0].username)
      throw new ForbiddenException({
        code: 'USERNAME_REQUIRED',
        message: 'Choose your username first',
      });
  }

  async profiles(
    id: string,
    page: PageDto,
    kind: 'search' | 'friends',
    term = '',
  ) {
    // Prefix parameter escapes SQL LIKE metacharacters; username '_' is literal.
    const prefix = term.replace(/[\\%_]/g, '\\$&') + '%';
    const rows: SafeProfile[] = await this.db!.query(
      `SELECT ${safeColumns} FROM users u ${relations}
      WHERE ${visible} AND $2::text IS NOT NULL AND ${kind === 'friends' ? 'f.id IS NOT NULL' : "u.username LIKE $2 ESCAPE E'\\\\'"}
      ORDER BY (u.username=$3) DESC,u.username,u.id LIMIT $4 OFFSET $5`,
      [id, prefix, term, page.limit + 1, (page.page - 1) * page.limit],
    );
    return {
      data: rows.slice(0, page.limit),
      page: page.page,
      limit: page.limit,
      hasMore: rows.length > page.limit,
    };
  }

  async profile(id: string, target: string): Promise<SafeProfile> {
    const rows: SafeProfile[] = await this.db!.query(
      `SELECT ${safeColumns} FROM users u ${relations} WHERE ${visible} AND u.id=$2`,
      [id, target],
    );
    if (!rows[0]) throw new NotFoundException('User not found');
    return rows[0];
  }

  async profileByUsername(id: string, username: string): Promise<SafeProfile> {
    const rows: SafeProfile[] = await this.db!.query(
      `SELECT ${safeColumns} FROM users u ${relations}
       WHERE u.username=$2 AND u.deleted_at IS NULL AND u.account_status='active'
       AND NOT EXISTS(SELECT 1 FROM user_blocks b WHERE
         (b.blocker_id=$1 AND b.blocked_id=u.id) OR (b.blocked_id=$1 AND b.blocker_id=u.id))`,
      [id, username],
    );
    if (!rows[0]) throw new NotFoundException('User not found');
    return rows[0];
  }

  async requests(
    id: string,
    page: PageDto,
    direction: 'incoming' | 'outgoing',
  ) {
    const ownerColumn = direction === 'incoming' ? 'receiver_id' : 'sender_id';
    const peerColumn = direction === 'incoming' ? 'sender_id' : 'receiver_id';
    const rows: (FriendRequest & {
      peer: Pick<SafeProfile, 'id' | 'username' | 'displayName' | 'avatarUrl'>;
    })[] = await this.db!.query(
      `SELECT
      r.id,r.sender_id AS "senderId",r.receiver_id AS "receiverId",r.status,r.created_at AS "createdAt",r.resolved_at AS "resolvedAt",
      jsonb_build_object('id',u.id,'username',u.username,'displayName',u.display_name,'avatarUrl',u.avatar_url) AS peer
      FROM friend_requests r JOIN users u ON u.id=r.${peerColumn}
      WHERE r.${ownerColumn}=$1 AND r.status='PENDING' AND ${visible}
      ORDER BY r.created_at DESC,r.id LIMIT $2 OFFSET $3`,
      [id, page.limit + 1, (page.page - 1) * page.limit],
    );
    return {
      data: rows.slice(0, page.limit),
      page: page.page,
      limit: page.limit,
      hasMore: rows.length > page.limit,
    };
  }

  async requestPeer(id: string, requestId: string): Promise<string> {
    const rows: FriendRequest[] = await this.db!.query(
      `SELECT ${requestColumns} FROM friend_requests WHERE id=$1 AND (sender_id=$2 OR receiver_id=$2)`,
      [requestId, id],
    );
    if (!rows[0]) throw new NotFoundException('Friend request not found');
    return rows[0].senderId === id ? rows[0].receiverId : rows[0].senderId;
  }

  async send(id: string, target: string): Promise<FriendRequest> {
    if (id === target)
      throw new ConflictException({
        code: 'SELF_REQUEST',
        message: 'Cannot send a request to yourself',
      });
    return this.transaction(async (m) => {
      await this.assertPair(m, id, target);
      const friends: { id: string }[] = await m.query(
        'SELECT id FROM friendships WHERE user_low_id=LEAST($1::uuid,$2::uuid) AND user_high_id=GREATEST($1::uuid,$2::uuid)',
        [id, target],
      );
      if (friends.length) this.changed();
      const pending: { id: string }[] = await m.query(
        "SELECT id FROM friend_requests WHERE LEAST(sender_id,receiver_id)=LEAST($1::uuid,$2::uuid) AND GREATEST(sender_id,receiver_id)=GREATEST($1::uuid,$2::uuid) AND status='PENDING'",
        [id, target],
      );
      if (pending.length) this.changed();
      const rows: FriendRequest[] = await m.query(
        `INSERT INTO friend_requests(sender_id,receiver_id) VALUES($1,$2) RETURNING ${requestColumns}`,
        [id, target],
      );
      return rows[0]!;
    });
  }

  async resolve(
    id: string,
    requestId: string,
    action: 'ACCEPTED' | 'REJECTED' | 'CANCELLED',
  ): Promise<FriendRequest> {
    return this.transaction(async (m) => {
      const rows: FriendRequest[] = await m.query(
        `SELECT ${requestColumns} FROM friend_requests WHERE id=$1`,
        [requestId],
      );
      const r = rows[0];
      if (
        !r ||
        (action === 'CANCELLED' ? r.senderId !== id : r.receiverId !== id)
      )
        throw new NotFoundException('Friend request not found');
      if (r.status !== 'PENDING') this.changed();
      await this.assertPair(m, r.senderId, r.receiverId);
      const updated: FriendRequest[] = await m.query(
        `WITH resolved AS (UPDATE friend_requests SET status=$2,resolved_at=now() WHERE id=$1 AND status='PENDING' RETURNING ${requestColumns}) SELECT * FROM resolved`,
        [requestId, action],
      );
      if (!updated[0]) this.changed();
      if (action === 'ACCEPTED')
        await m.query(
          'INSERT INTO friendships(user_low_id,user_high_id) VALUES(LEAST($1::uuid,$2::uuid),GREATEST($1::uuid,$2::uuid))',
          [r.senderId, r.receiverId],
        );
      return updated[0]!;
    });
  }

  async block(id: string, target: string): Promise<void> {
    if (id === target) throw new ConflictException('Cannot block yourself');
    await this.transaction(async (m) => {
      await this.assertUsers(m, id, target);
      await m.query(
        'INSERT INTO user_blocks(blocker_id,blocked_id) VALUES($1,$2) ON CONFLICT DO NOTHING',
        [id, target],
      );
      await this.removePair(m, id, target);
      await m.query(
        "UPDATE friend_requests SET status='CANCELLED',resolved_at=now() WHERE status='PENDING' AND LEAST(sender_id,receiver_id)=LEAST($1::uuid,$2::uuid) AND GREATEST(sender_id,receiver_id)=GREATEST($1::uuid,$2::uuid)",
        [id, target],
      );
    });
  }
  async unblock(id: string, target: string): Promise<void> {
    await this.transaction(async (m) => {
      await m.query(
        'DELETE FROM user_blocks WHERE blocker_id=$1 AND blocked_id=$2',
        [id, target],
      );
    });
  }
  async unfriend(id: string, target: string): Promise<void> {
    await this.transaction(async (m) => {
      await this.assertPair(m, id, target);
      await this.removePair(m, id, target);
    });
  }
  async blocks(id: string, page: PageDto) {
    const rows: Pick<
      SafeProfile,
      'id' | 'username' | 'displayName' | 'avatarUrl'
    >[] = await this.db!.query(
      `SELECT u.id,u.username,u.display_name AS "displayName",u.avatar_url AS "avatarUrl"
      FROM user_blocks b JOIN users u ON u.id=b.blocked_id WHERE b.blocker_id=$1 AND u.deleted_at IS NULL
      ORDER BY b.created_at DESC,u.id LIMIT $2 OFFSET $3`,
      [id, page.limit + 1, (page.page - 1) * page.limit],
    );
    return {
      data: rows.slice(0, page.limit),
      page: page.page,
      limit: page.limit,
      hasMore: rows.length > page.limit,
    };
  }
  private async removePair(m: EntityManager, id: string, target: string) {
    await m.query(
      'DELETE FROM friendships WHERE user_low_id=LEAST($1::uuid,$2::uuid) AND user_high_id=GREATEST($1::uuid,$2::uuid)',
      [id, target],
    );
  }
  private async assertUsers(m: EntityManager, id: string, target: string) {
    const users: { id: string }[] = await m.query(
      "SELECT id FROM users WHERE id IN ($1,$2) AND deleted_at IS NULL AND account_status='active' AND username IS NOT NULL",
      [id, target],
    );
    if (users.length !== 2) throw new NotFoundException('User not found');
  }
  private async assertPair(m: EntityManager, id: string, target: string) {
    await this.assertUsers(m, id, target);
    const blocks: { blocker_id: string }[] = await m.query(
      'SELECT blocker_id FROM user_blocks WHERE (blocker_id=$1 AND blocked_id=$2) OR (blocker_id=$2 AND blocked_id=$1)',
      [id, target],
    );
    if (blocks.length) throw new NotFoundException('User not found');
  }
  private code(e: unknown): string | undefined {
    return typeof e === 'object' && e !== null
      ? (e as { code?: string }).code
      : undefined;
  }
  private changed(): never {
    throw new ConflictException({
      code: 'FRIEND_REQUEST_STATE_CHANGED',
      message: 'Relationship changed. Refresh and try again.',
    });
  }
  private async transaction<T>(
    action: (m: EntityManager) => Promise<T>,
  ): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      try {
        return await this.db!.transaction('SERIALIZABLE', action);
      } catch (e) {
        if (['40001', '40P01'].includes(this.code(e) ?? '') && attempt < 3)
          continue;
        if (['23505', '40001', '40P01'].includes(this.code(e) ?? ''))
          this.changed();
        throw e;
      }
    }
  }
}
