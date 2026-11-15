import { HttpException, Inject, Injectable, UnauthorizedException, type OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AccountAuthorityClient } from '@loccoc/common';
import type { Server as HttpServer } from 'node:http';
import { isUUID } from 'class-validator';
import { Server, type Socket } from 'socket.io';
import { ChatPolicy } from '../chat/chat.policy.js';
import { ChatRepository } from '../chat/chat.repository.js';
import type { ChatEvents } from '../chat/chat.types.js';

interface Session {
  readonly socket: Socket;
  readonly authorization: string;
  readonly accountId: string;
  lastTypingAt: number;
  readonly typingTimers: Map<string, NodeJS.Timeout>;
}

interface SafeError { code: number; message: string }

function safeError(error: unknown): SafeError {
  const status = error instanceof HttpException ? error.getStatus() : 503;
  if (status === 401) return { code: 401, message: 'Authentication required' };
  if (status === 403 || status === 404) return { code: 403, message: 'Chat access denied' };
  if (status === 429) return { code: 429, message: 'Too many chat connections' };
  return { code: 503, message: 'Chat verification unavailable' };
}

@Injectable()
export class ChatSocketService implements ChatEvents, OnApplicationShutdown {
  private io?: Server;
  private stopping = false;
  private readonly sessions = new Map<string, Set<Session>>();

  constructor(
    @Inject(AccountAuthorityClient) private readonly authority: AccountAuthorityClient,
    @Inject(ChatPolicy) private readonly policy: ChatPolicy,
    @Inject(ChatRepository) private readonly repository: ChatRepository,
    @Inject(ConfigService) private readonly config: ConfigService,
  ) {}

  attach(httpServer: HttpServer): void {
    if (this.io) return;
    const origins = this.config.get<string>('CORS_ORIGINS', 'http://localhost:3000')
      .split(',').map(origin => origin.trim()).filter(Boolean);
    this.io = new Server(httpServer, {
      path: '/socket.io', cors: { origin: origins, credentials: true },
      maxHttpBufferSize: 16_384,
    });
    const chat = this.io.of('/chat');
    chat.use((socket, next) => {
      void this.register(socket).then(session => {
        socket.data.chatSession = session;
        next();
      }).catch((error: unknown) => {
        const safe = safeError(error);
        next(Object.assign(new Error(safe.message), { data: safe }));
      });
    });
    chat.on('connection', socket => {
      const session = socket.data.chatSession as Session;
      socket.on('typing:update', (payload: unknown) => {
        void this.typing(session, payload).catch((error: unknown) => this.reject(session, safeError(error)));
      });
    });
  }

  async publish(accountIds: string[], event: string, payload: unknown, conversationId: string): Promise<void> {
    if (this.stopping) return;
    const recipients = [...new Set(accountIds)].flatMap(accountId => [...(this.sessions.get(accountId) ?? [])]);
    await Promise.all(recipients.map(async session => {
      if (!session.socket.connected) return;
      try {
        await this.authorizeConversation(session, conversationId);
        if (!this.stopping && session.socket.connected) session.socket.emit(event, payload);
      } catch (error: unknown) {
        this.reject(session, safeError(error));
      }
    }));
  }

  async onApplicationShutdown(): Promise<void> {
    this.stopping = true;
    for (const sessions of this.sessions.values()) {
      for (const session of sessions) this.remove(session);
    }
    this.sessions.clear();
    const io = this.io;
    this.io = undefined;
    if (io) await new Promise<void>(resolve => io.close(() => resolve()));
  }

  private async register(socket: Socket): Promise<Session> {
    const token: unknown = socket.handshake.auth?.accessToken;
    if (typeof token !== 'string' || !/^\S+$/.test(token) || token.length > 16_000) throw new UnauthorizedException();
    const authorization = `Bearer ${token}`;
    const decision = await this.authority.access(authorization);
    const accountId = decision.user.userId;
    if (!isUUID(accountId) || accountId !== decision.account.id) throw new UnauthorizedException();
    if (this.stopping || socket.conn.readyState !== 'open') throw new HttpException('Chat verification unavailable', 503);
    // No await between quota lookup and reservation: concurrent handshakes cannot exceed five.
    const sessions = this.sessions.get(accountId) ?? new Set<Session>();
    if (sessions.size >= 5) throw new HttpException('Too many chat connections', 429);
    const session: Session = { socket, authorization, accountId, lastTypingAt: -Infinity, typingTimers: new Map() };
    sessions.add(session); this.sessions.set(accountId, sessions);
    socket.on('disconnect', () => this.remove(session));
    socket.conn.once('close', () => this.remove(session));
    return session;
  }

  private async authorize(session: Session): Promise<void> {
    const decision = await this.authority.access(session.authorization);
    if (decision.user.userId !== session.accountId || decision.account.id !== session.accountId) throw new UnauthorizedException();
  }

  private async authorizeConversation(session: Session, conversationId: string): Promise<string> {
    await this.authorize(session);
    const member = await this.repository.member(session.accountId, conversationId);
    await this.policy.profile(session.authorization, member.peerId);
    return member.peerId;
  }

  private async typing(session: Session, payload: unknown): Promise<void> {
    await this.authorize(session);
    if (!session.socket.connected || this.stopping) return;
    if (!this.isTypingPayload(payload)) {
      this.reject(session, { code: 400, message: 'Invalid typing update' }); return;
    }
    const now = Date.now();
    if (now - session.lastTypingAt < 1000) {
      this.reject(session, { code: 429, message: 'Typing updates are too frequent' }); return;
    }
    session.lastTypingAt = now;
    const member = await this.repository.member(session.accountId, payload.conversationId);
    await this.policy.profile(session.authorization, member.peerId);
    if (!session.socket.connected || this.stopping) return;
    this.cancelTyping(session, payload.conversationId);
    await this.publish([member.peerId], 'typing:updated', {
      conversationId: payload.conversationId, accountId: session.accountId, isTyping: payload.isTyping,
    }, payload.conversationId);
    if (payload.isTyping && session.socket.connected && !this.stopping) {
      const timer = setTimeout(() => {
        session.typingTimers.delete(payload.conversationId);
        void this.expireTyping(session, payload.conversationId);
      }, 3000);
      timer.unref(); session.typingTimers.set(payload.conversationId, timer);
    }
  }

  private async expireTyping(session: Session, conversationId: string): Promise<void> {
    if (this.stopping || !session.socket.connected) return;
    try {
      const peerId = await this.authorizeConversation(session, conversationId);
      await this.publish([peerId], 'typing:updated', { conversationId, accountId: session.accountId, isTyping: false }, conversationId);
    } catch (error: unknown) {
      this.reject(session, safeError(error));
    }
  }

  private cancelTyping(session: Session, conversationId: string): void {
    const timer = session.typingTimers.get(conversationId);
    if (timer) clearTimeout(timer);
    session.typingTimers.delete(conversationId);
  }

  private remove(session: Session): void {
    for (const timer of session.typingTimers.values()) clearTimeout(timer);
    session.typingTimers.clear();
    const sessions = this.sessions.get(session.accountId);
    sessions?.delete(session);
    if (sessions?.size === 0) this.sessions.delete(session.accountId);
  }

  private reject(session: Session, error: SafeError): void {
    if (!session.socket.connected) return;
    session.socket.emit('chat:error', error);
    if (error.code === 401 || error.code === 503) session.socket.disconnect(true);
  }

  private isTypingPayload(payload: unknown): payload is { conversationId: string; isTyping: boolean } {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return false;
    const value = payload as Record<string, unknown>;
    return Object.keys(value).length === 2 && typeof value.conversationId === 'string'
      && isUUID(value.conversationId) && typeof value.isTyping === 'boolean';
  }

}
