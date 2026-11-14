import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import type { ChatMessage, HistoryQuery, Member } from './chat.types.js';

const messageColumns = `id, conversation_id AS "conversationId", sender_id AS "senderId",
  client_message_id AS "clientMessageId",sequence::text,text,created_at AS "createdAt"`;
const memberSelect = `SELECT c.id, peer.account_id AS "peerId", me.last_read_sequence::text AS "lastReadSequence",
  peer.last_read_sequence::text AS "peerLastReadSequence", c.updated_at AS "updatedAt",
  (SELECT count(*)::int FROM messages m WHERE m.conversation_id=c.id AND m.sender_id<>$1 AND m.sequence>me.last_read_sequence) AS "unreadCount",
  (SELECT jsonb_build_object('id',m.id,'conversationId',m.conversation_id,'senderId',m.sender_id,
    'clientMessageId',m.client_message_id,'sequence',m.sequence::text,'text',m.text,'createdAt',m.created_at)
    FROM messages m WHERE m.conversation_id=c.id ORDER BY m.sequence DESC LIMIT 1) AS "lastMessage"
  FROM conversations c JOIN conversation_members me ON me.conversation_id=c.id AND me.account_id=$1
  JOIN conversation_members peer ON peer.conversation_id=c.id AND peer.account_id<>me.account_id`;
const message = (row: ChatMessage): ChatMessage => ({ ...row, createdAt: new Date(row.createdAt).toISOString() });
const member = (row: Member): Member => ({ ...row, updatedAt: new Date(row.updatedAt).toISOString(), lastMessage: row.lastMessage ? message(row.lastMessage) : null });

@Injectable()
export class ChatRepository {
  constructor(@Inject(DataSource) private readonly db: DataSource) {}

  async openDirect(accountId: string, peerId: string): Promise<string> {
    const [low, high] = [accountId.toLowerCase(), peerId.toLowerCase()].sort();
    if (low === high) throw new BadRequestException('Cannot chat with yourself');
    return this.db.transaction(async tx => {
      const rows: { id: string }[] = await tx.query(`INSERT INTO conversations(id,user_low_id,user_high_id) VALUES($1,$2,$3)
        ON CONFLICT(user_low_id,user_high_id) DO UPDATE SET user_low_id=EXCLUDED.user_low_id RETURNING id`, [randomUUID(), low, high]);
      const id = rows[0]!.id;
      await tx.query(`INSERT INTO conversation_members(conversation_id,account_id) VALUES($1,$2),($1,$3) ON CONFLICT DO NOTHING`, [id, low, high]);
      return id;
    });
  }

  async member(accountId: string, conversationId: string): Promise<Member> {
    const rows: Member[] = await this.db.query(`${memberSelect} WHERE c.id=$2`, [accountId, conversationId]);
    if (!rows[0]) throw new NotFoundException('Conversation not found');
    return member(rows[0]);
  }

  async list(accountId: string, limit: number, cursor?: string): Promise<{ data: Member[]; nextCursor: string | null }> {
    let boundary: [string, string] | undefined;
    if (cursor) {
      try {
        if (cursor.length > 512) throw new Error();
        const parsed: unknown = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
        if (!Array.isArray(parsed) || parsed.length !== 2 || typeof parsed[0] !== 'string' || typeof parsed[1] !== 'string' ||
          !Number.isFinite(Date.parse(parsed[0])) || !/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(parsed[1])) throw new Error();
        boundary = parsed as [string, string];
      } catch { throw new BadRequestException('Invalid conversation cursor'); }
    }
    const rows: Member[] = boundary
      ? await this.db.query(`${memberSelect} WHERE (c.updated_at,c.id)<($2::timestamptz,$3::uuid) ORDER BY c.updated_at DESC,c.id DESC LIMIT $4`, [accountId, ...boundary, limit + 1])
      : await this.db.query(`${memberSelect} ORDER BY c.updated_at DESC,c.id DESC LIMIT $2`, [accountId, limit + 1]);
    const data = rows.slice(0, limit).map(member); const last = data.at(-1);
    return { data, nextCursor: rows.length > limit && last ? Buffer.from(JSON.stringify([last.updatedAt, last.id])).toString('base64url') : null };
  }

  async history(accountId: string, conversationId: string, query: HistoryQuery): Promise<{ data: ChatMessage[]; hasMore: boolean }> {
    await this.member(accountId, conversationId);
    if (query.before && query.after) throw new BadRequestException('Use before or after, not both');
    const bound = query.before ?? query.after;
    const args: unknown[] = [conversationId];
    if (bound) args.push(bound);
    args.push(query.limit + 1);
    const rows: ChatMessage[] = await this.db.query(`SELECT ${messageColumns} FROM messages WHERE conversation_id=$1
      ${bound ? `AND sequence ${query.after ? '>' : '<'} $2::bigint` : ''}
      ORDER BY sequence ${query.after ? 'ASC' : 'DESC'} LIMIT $${args.length}`, args);
    const data = rows.slice(0, query.limit).map(message);
    return { data: query.after ? data : data.reverse(), hasMore: rows.length > query.limit };
  }

  async send(accountId: string, conversationId: string, clientMessageId: string, text: string): Promise<{ message: ChatMessage; created: boolean }> {
    // PostgreSQL UUID equality ignores case; the lock key and retry comparison
    // must use that same canonical identity, including non-HTTP callers.
    accountId = accountId.toLowerCase();
    conversationId = conversationId.toLowerCase();
    clientMessageId = clientMessageId.toLowerCase();
    return this.db.transaction(async tx => {
      const membership = await tx.query('SELECT 1 FROM conversation_members WHERE conversation_id=$1 AND account_id=$2', [conversationId, accountId]);
      if (!membership.length) throw new NotFoundException('Conversation not found');
      await tx.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [`${accountId}:${clientMessageId}`]);
      const existing: ChatMessage[] = await tx.query(`SELECT ${messageColumns} FROM messages WHERE sender_id=$1 AND client_message_id=$2`, [accountId, clientMessageId]);
      if (existing[0]) {
        if (existing[0].conversationId !== conversationId || existing[0].text !== text) throw new ConflictException({ code: 'MESSAGE_ID_CONFLICT', message: 'Message ID was used for different content' });
        return { message: message(existing[0]), created: false };
      }
      const rows: { sequence: string }[] = await tx.query(`WITH updated AS (UPDATE conversations SET last_sequence=last_sequence+1,
        updated_at=date_trunc('milliseconds',clock_timestamp()) WHERE id=$1 RETURNING last_sequence)
        SELECT last_sequence::text AS sequence FROM updated`, [conversationId]);
      const inserted: ChatMessage[] = await tx.query(`INSERT INTO messages(id,conversation_id,sender_id,client_message_id,sequence,text)
        VALUES($1,$2,$3,$4,$5,$6) RETURNING ${messageColumns}`, [randomUUID(), conversationId, accountId, clientMessageId, rows[0]!.sequence, text]);
      return { message: message(inserted[0]!), created: true };
    });
  }

  async read(accountId: string, conversationId: string, sequence: string): Promise<{ lastReadSequence: string; unreadCount: number }> {
    await this.member(accountId, conversationId);
    if (sequence !== '0') {
      const exists = await this.db.query('SELECT 1 FROM messages WHERE conversation_id=$1 AND sequence=$2::bigint', [conversationId, sequence]);
      if (!exists.length) throw new BadRequestException('Read cursor does not identify a message');
    }
    await this.db.query(`UPDATE conversation_members SET last_read_sequence=GREATEST(last_read_sequence,$3::bigint) WHERE conversation_id=$1 AND account_id=$2`, [conversationId, accountId, sequence]);
    const current = await this.member(accountId, conversationId);
    return { lastReadSequence: current.lastReadSequence, unreadCount: current.unreadCount };
  }
}
