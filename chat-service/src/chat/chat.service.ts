import { BadRequestException, ForbiddenException, HttpException, Inject, Injectable, Logger } from '@nestjs/common';
import { ChatRepository } from './chat.repository.js';
import { ChatPolicy } from './chat.policy.js';
import { CHAT_EVENTS, type ChatEvents, type Conversation, type HistoryQuery, type Member } from './chat.types.js';

@Injectable()
export class ChatService {
  private readonly quotas = new Map<string, { reset: number; count: number }>();
  private readonly logger = new Logger(ChatService.name);
  constructor(@Inject(ChatRepository) private readonly repo: ChatRepository,
    @Inject(ChatPolicy) private readonly policy: ChatPolicy,
    @Inject(CHAT_EVENTS) private readonly events: ChatEvents) {}

  private async present(member: Member, authorization: string): Promise<Conversation> {
    const { peerId, ...rest } = member;
    try { return { ...rest, peer: await this.policy.profile(authorization, peerId), canInteract: true }; }
    catch (error) {
      if (!(error instanceof ForbiddenException)) throw error;
      return { ...rest, peer: null, canInteract: false };
    }
  }
  async direct(id: string, peerId: string, authorization: string) {
    if (id === peerId) throw new BadRequestException('Cannot chat with yourself');
    await this.policy.profile(authorization, peerId);
    const conversationId = await this.repo.openDirect(id, peerId);
    return { conversation: await this.detail(id, conversationId, authorization) };
  }
  async detail(id: string, conversationId: string, authorization: string): Promise<Conversation> {
    return this.present(await this.repo.member(id, conversationId), authorization);
  }
  async list(id: string, limit: number, cursor: string | undefined, authorization: string) {
    const page = await this.repo.list(id, limit, cursor);
    return { data: await Promise.all(page.data.map(row => this.present(row, authorization))), nextCursor: page.nextCursor };
  }
  history(id: string, conversationId: string, query: HistoryQuery) { return this.repo.history(id, conversationId, query); }
  private quota(id: string): void {
    const now = Date.now();
    if (this.quotas.size > 1000) for (const [key, entry] of this.quotas) if (entry.reset <= now) this.quotas.delete(key);
    let quota = this.quotas.get(id);
    if (!quota || quota.reset <= now) { quota = { reset: now + 60000, count: 0 }; this.quotas.set(id, quota); }
    if (++quota.count > 30) throw new HttpException({ code: 'CHAT_RATE_LIMIT', message: 'Too many messages; try again later' }, 429);
  }
  private notify(accounts: string[], event: string, payload: unknown, conversationId: string): void {
    void this.events.publish(accounts, event, payload, conversationId).catch(() => this.logger.warn('Realtime delivery unavailable; clients can resync history'));
  }
  async send(id: string, conversationId: string, clientMessageId: string, text: string, authorization: string) {
    const member = await this.repo.member(id, conversationId);
    await this.policy.profile(authorization, member.peerId); this.quota(id);
    const result = await this.repo.send(id, conversationId, clientMessageId, text);
    if (result.created) {
      this.notify([id, member.peerId], 'message:new', { message: result.message }, conversationId);
      this.notify([id, member.peerId], 'conversation:updated', { conversationId }, conversationId);
    }
    return { message: result.message };
  }
  async read(id: string, conversationId: string, sequence: string, authorization: string) {
    const member = await this.repo.member(id, conversationId);
    await this.policy.profile(authorization, member.peerId);
    const result = await this.repo.read(id, conversationId, sequence);
    this.notify([id, member.peerId], 'conversation:read', { conversationId, accountId: id, sequence: result.lastReadSequence }, conversationId);
    this.notify([id], 'conversation:updated', { conversationId }, conversationId);
    return result;
  }
}
