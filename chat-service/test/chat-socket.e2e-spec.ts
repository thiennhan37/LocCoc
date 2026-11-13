import 'reflect-metadata';
import { createServer, type Server as HttpServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { ForbiddenException, NotFoundException, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AccountAuthorityClient, type AccessDecision } from '@loccoc/common';
import { io, type Socket } from 'socket.io-client';
import { ChatPolicy } from '../src/chat/chat.policy.js';
import { ChatRepository } from '../src/chat/chat.repository.js';
import { ChatSocketService } from '../src/realtime/chat-socket.service.js';

const [alice, bob, outsider, conversationId] = [randomUUID(), randomUUID(), randomUUID(), randomUUID()];
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

function event<T = unknown>(socket: Socket, name: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { socket.off(name, listener); reject(new Error(`Missing ${name}`)); }, 4500);
    const listener = (value: T) => { clearTimeout(timer); resolve(value); };
    socket.once(name, listener);
  });
}

describe('authenticated realtime socket transport', () => {
  let server: HttpServer, transport: ChatSocketService, origin: string;
  let sockets: Socket[];
  let revoked: Set<string>, unavailable: boolean, malformedUpstreamError: boolean, blocked: boolean;
  let identities: Map<string, string>;

  beforeEach(async () => {
    sockets = []; revoked = new Set(); unavailable = false; malformedUpstreamError = false; blocked = false;
    identities = new Map([['token-alice', alice!], ['token-bob', bob!], ['token-outsider', outsider!]]);
    const authority = {
      async access(authorization: string): Promise<AccessDecision> {
        // Deliberately async: parallel handshakes must still reserve quota atomically.
        await delay(5);
        if (malformedUpstreamError) throw { code: 503, message: 'private token details' };
        if (unavailable) throw new ServiceUnavailableException('private upstream details');
        const token = authorization.slice(7), id = identities.get(token);
        if (!authorization.startsWith('Bearer ') || !id || revoked.has(token)) throw new UnauthorizedException('private token details');
        return { account: { id, email: 'private@example.test', phone: null, status: 'active', version: 1 }, user: { userId: id, role: 'user', roles: ['user'], scopes: [], sessionId: 'session', issuer: 'auth', audience: 'chat' } };
      },
    } as AccountAuthorityClient;
    const policy = {
      async profile(authorization: string, peerId: string) {
        if (blocked) throw new ForbiddenException('private relationship details');
        if (!identities.has(authorization.slice(7))) throw new UnauthorizedException();
        return { id: peerId, username: 'friend', displayName: 'Friend', avatarUrl: null };
      },
    } as ChatPolicy;
    const repository = {
      async member(accountId: string, id: string) {
        if (id !== conversationId || (accountId !== alice && accountId !== bob)) throw new NotFoundException('private conversation details');
        return { id, peerId: accountId === alice ? bob! : alice!, lastReadSequence: '0', peerLastReadSequence: '0', unreadCount: 0, lastMessage: null, updatedAt: '2026-11-13T00:00:00.000Z' };
      },
    } as ChatRepository;
    server = createServer();
    transport = new ChatSocketService(authority, policy, repository, new ConfigService({ CORS_ORIGINS: 'http://localhost:3000' }));
    transport.attach(server);
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Missing TCP address');
    origin = `http://127.0.0.1:${address.port}/chat`;
  });

  afterEach(async () => {
    for (const socket of sockets) socket.close();
    await transport.onApplicationShutdown();
    if (server.listening) await new Promise<void>(resolve => server.close(() => resolve()));
  });

  function client(token?: string): Socket {
    const socket = io(origin, { path: '/socket.io', transports: ['websocket'], auth: token === undefined ? {} : { accessToken: token }, forceNew: true, reconnection: false, autoConnect: false });
    sockets.push(socket); return socket;
  }
  async function connected(token: string): Promise<Socket> {
    const socket = client(token); const ready = event(socket, 'connect'); socket.connect(); await ready; return socket;
  }

  it.each([undefined, 'invalid-token', 'Bearer token-alice'])('refuses invalid handshake credentials %s with a refreshable code', async token => {
    const socket = client(token); const failure = event<{ message: string; data: { code: number } }>(socket, 'connect_error');
    socket.connect();
    expect(await failure).toMatchObject({ data: { code: 401 } });
    expect(socket.connected).toBe(false);
  });

  it('sanitizes unexpected authority errors during the handshake', async () => {
    malformedUpstreamError = true;
    const socket = client('token-alice'); const failure = event<{ message: string; data: { code: number; message: string } }>(socket, 'connect_error');
    socket.connect();
    expect(await failure).toMatchObject({ message: 'Chat verification unavailable', data: { code: 503, message: 'Chat verification unavailable' } });
  });

  it('delivers a committed event only to authenticated conversation participants', async () => {
    const a = await connected('token-alice'), b = await connected('token-bob'), c = await connected('token-outsider');
    const leaked: unknown[] = []; c.on('message:new', value => leaked.push(value));
    const first = event(a, 'message:new'), second = event(b, 'message:new');
    const payload = { message: { id: randomUUID(), conversationId, text: 'Xin chào 👋', sequence: '1' } };
    await transport.publish([alice!, bob!, outsider!], 'message:new', payload, conversationId!);
    expect(await first).toEqual(payload); expect(await second).toEqual(payload);
    await delay(40); expect(leaked).toEqual([]);
  });

  it('revalidates receiving sessions before every delivery and disconnects revoked sockets', async () => {
    const b = await connected('token-bob'); const received: unknown[] = [];
    b.on('message:new', value => received.push(value));
    const rejected = event(b, 'chat:error'), disconnected = event(b, 'disconnect');
    revoked.add('token-bob');
    await transport.publish([bob!], 'message:new', { secret: 'must not arrive' }, conversationId!);
    expect(await rejected).toMatchObject({ code: 401 }); await disconnected;
    expect(received).toEqual([]); expect(b.connected).toBe(false);
  });

  it('does not reuse a handshake identity when an authority response changes account', async () => {
    const a = await connected('token-alice'); const received: unknown[] = [];
    a.on('message:new', value => received.push(value));
    const rejected = event(a, 'chat:error'); identities.set('token-alice', bob!);
    await transport.publish([alice!], 'message:new', { secret: 'must not arrive' }, conversationId!);
    expect(await rejected).toMatchObject({ code: 401 }); expect(received).toEqual([]);
  });

  it('fails closed during authority outages without exposing upstream details', async () => {
    const a = await connected('token-alice'); const received: unknown[] = [];
    a.on('message:new', value => received.push(value));
    const rejected = event(a, 'chat:error'); unavailable = true;
    await transport.publish([alice!], 'message:new', { secret: 'must not arrive' }, conversationId!);
    expect(await rejected).toEqual({ code: 503, message: 'Chat verification unavailable' });
    expect(received).toEqual([]);
  });

  it('checks friendship again before publishing to an existing session', async () => {
    const b = await connected('token-bob'); const received: unknown[] = [];
    b.on('message:new', value => received.push(value)); const rejected = event(b, 'chat:error'); blocked = true;
    await transport.publish([bob!], 'message:new', { secret: 'must not arrive' }, conversationId!);
    expect(await rejected).toMatchObject({ code: 403 }); expect(received).toEqual([]);
  });

  it('denies forged typing and rejects extra identity fields', async () => {
    const c = await connected('token-outsider'), a = await connected('token-alice'), b = await connected('token-bob');
    const received: unknown[] = []; b.on('typing:updated', value => received.push(value));
    const forbidden = event(c, 'chat:error'); c.emit('typing:update', { conversationId, isTyping: true });
    expect(await forbidden).toMatchObject({ code: 403 });
    const invalid = event(a, 'chat:error'); a.emit('typing:update', { conversationId, isTyping: true, accountId: bob });
    expect(await invalid).toMatchObject({ code: 400 }); await delay(40); expect(received).toEqual([]);
  });

  it('relays authenticated typing, limits bursts and expires typing after three seconds', async () => {
    const a = await connected('token-alice'), b = await connected('token-bob');
    const typing = event(b, 'typing:updated'); a.emit('typing:update', { conversationId, isTyping: true });
    expect(await typing).toEqual({ conversationId, accountId: alice, isTyping: true });
    const limited = event(a, 'chat:error'); a.emit('typing:update', { conversationId, isTyping: false });
    expect(await limited).toMatchObject({ code: 429 });
    expect(await event(b, 'typing:updated')).toEqual({ conversationId, accountId: alice, isTyping: false });
  });

  it('checks incoming session authority again after connection', async () => {
    const a = await connected('token-alice'), b = await connected('token-bob');
    const received: unknown[] = []; b.on('typing:updated', value => received.push(value));
    const rejected = event(a, 'chat:error'); revoked.add('token-alice');
    a.emit('typing:update', { conversationId, isTyping: true });
    expect(await rejected).toMatchObject({ code: 401 }); await delay(40); expect(received).toEqual([]);
  });

  it('atomically caps concurrent sockets and releases quota after disconnect', async () => {
    const clients = Array.from({ length: 7 }, () => client('token-alice'));
    const results = await Promise.all(clients.map(socket => new Promise<'connected' | number>(resolve => {
      socket.once('connect', () => resolve('connected'));
      socket.once('connect_error', error => resolve(error.data.code)); socket.connect();
    })));
    expect(results.filter(result => result === 'connected')).toHaveLength(5);
    expect(results.filter(result => result === 429)).toHaveLength(2);
    clients.find(socket => socket.connected)!.close(); await delay(40);
    expect((await connected('token-alice')).connected).toBe(true);
  });

  it('does not expose arbitrary room join or socket message writes', async () => {
    const c = await connected('token-outsider'), b = await connected('token-bob'); const received: unknown[] = [];
    c.on('message:new', value => received.push(value)); b.on('message:new', value => received.push(value));
    c.emit('join', conversationId); c.emit('message:send', { conversationId, text: 'forged' });
    await delay(40); expect(received).toEqual([]);
  });
});
