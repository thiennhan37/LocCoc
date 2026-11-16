import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { DataSource } from 'typeorm';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { io, type Socket } from 'socket.io-client';
import { configureChat } from '../src/bootstrap.js';
import { CreateChat1794528000000 } from '../src/database/migrations/1794528000000-CreateChat.js';

const url = process.env.CHAT_TEST_DB_URL;
describe.skipIf(!url)('authenticated chat HTTP with real persistence and HTTP authority', () => {
  let db: DataSource, admin: DataSource, upstream: Server, app: INestApplication;
  const schema = `chat_http_${randomUUID().replaceAll('-', '')}`;
  const a = randomUUID(), b = randomUUID(), c = randomUUID();
  let friends = true, authorityDown = false, revoked = false;
  beforeAll(async () => {
    upstream = createServer((req, res) => {
      res.setHeader('content-type', 'application/json');
      const id = ({ 'Bearer token-a': a, 'Bearer token-b': b, 'Bearer token-c': c } as Record<string, string>)[req.headers.authorization ?? ''];
      if (authorityDown) { res.writeHead(503).end('{}'); return; }
      if (!id || revoked) { res.writeHead(401).end('{}'); return; }
      if (req.url === '/internal/access') {
        if (req.headers['x-service-token'] !== 'test-internal-service-token-123456789') { res.writeHead(403).end('{}'); return; }
        res.end(JSON.stringify({ user: { userId: id, role: 'user' }, account: { id, status: 'active' } })); return;
      }
      const peer = req.url?.split('/').at(-1);
      res.end(JSON.stringify({ id: peer, username: peer === a ? 'alice' : 'bob', displayName: 'Real peer', avatarUrl: null, relationshipStatus: friends ? 'FRIENDS' : 'NONE' }));
    });
    await new Promise<void>(resolve => upstream.listen(0, '127.0.0.1', resolve));
    const baseUrl = `http://127.0.0.1:${(upstream.address() as AddressInfo).port}`;
    vi.stubEnv('NODE_ENV', 'test'); vi.stubEnv('INTERNAL_SERVICE_TOKEN', 'test-internal-service-token-123456789');
    vi.stubEnv('CHAT_DB_PASSWORD', 'test-only'); vi.stubEnv('AUTH_SERVICE_URL', baseUrl); vi.stubEnv('USER_SERVICE_URL', baseUrl);
    admin = await new DataSource({ type: 'postgres', url }).initialize();
    await admin.query(`CREATE SCHEMA "${schema}"`);
    db = await new DataSource({ type: 'postgres', url, schema, extra: { options: `-c search_path=${schema}` }, migrations: [CreateChat1794528000000], migrationsRun: true }).initialize();
    const { AppModule } = await import('../src/app.module.js');
    const module = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(DataSource).useValue(db).compile();
    app = module.createNestApplication({ logger: false }); configureChat(app);
    await app.listen(0, '127.0.0.1');
  });
  beforeEach(async () => { friends = true; authorityDown = false; revoked = false; await db.query('TRUNCATE conversations CASCADE'); });
  afterAll(async () => {
    await app?.close(); if (db?.isInitialized) await db.destroy();
    if (admin?.isInitialized) { await admin.query(`DROP SCHEMA "${schema}" CASCADE`); await admin.destroy(); }
    if (upstream) await new Promise<void>(resolve => upstream.close(() => resolve())); vi.unstubAllEnvs();
  });
  const api = () => request(app.getHttpServer());
  async function open() { return (await api().post('/chat/conversations/direct').set('authorization', 'Bearer token-a').send({ peerId: b }).expect(200)).body.conversation.id as string; }
  async function connect(token: string): Promise<Socket> {
    const socket = io(`http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}/chat`, { transports: ['websocket'], auth: { accessToken: token }, reconnection: false, forceNew: true });
    await new Promise<void>((resolve, reject) => { socket.once('connect', resolve); socket.once('connect_error', reject); });
    return socket;
  }

  it('keeps health public but rejects missing, forged and revoked identity', async () => {
    await api().get('/health').expect(200, { status: 'ok' });
    await api().get('/chat/conversations').set('x-user-id', a).expect(401);
    revoked = true; await api().get('/chat/conversations').set('authorization', 'Bearer token-a').expect(401);
  });
  it('persists a send once, returns binary-safe JSON and rejects conflicting retries', async () => {
    const id = await open(); const body = { clientMessageId: randomUUID(), text: '  Xin chào 👋  ' };
    const first = await api().post(`/chat/conversations/${id}/messages`).set('authorization', 'Bearer token-a').send(body).expect(200);
    expect(first.body.message.text).toBe('Xin chào 👋'); expect(first.body.message.sequence).toBe('1');
    const retry = await api().post(`/chat/conversations/${id}/messages`).set('authorization', 'Bearer token-a').send(body).expect(200);
    expect(retry.body.message.id).toBe(first.body.message.id);
    await api().post(`/chat/conversations/${id}/messages`).set('authorization', 'Bearer token-a').send({ ...body, text: 'changed' }).expect(409);
    const inbox = await api().get('/chat/conversations').set('authorization', 'Bearer token-b').expect(200);
    expect(inbox.body.data[0].unreadCount).toBe(1);
    const read = await api().patch(`/chat/conversations/${id}/read`).set('authorization', 'Bearer token-b').send({ sequence: '1' }).expect(200);
    expect(read.body.lastReadSequence).toBe('1');
    const detail = await api().get(`/chat/conversations/${id}`).set('authorization', 'Bearer token-a').expect(200);
    expect(detail.body.conversation.peerLastReadSequence).toBe('1');
    expect(first.headers['x-request-id']).toBeTruthy();
  });
  it('rejects impersonation, empty/oversized messages, mixed cursors, malformed limits and IDOR', async () => {
    const id = await open(); const path = `/chat/conversations/${id}`;
    for (const body of [
      { clientMessageId: randomUUID(), text: 'hello', senderId: b },
      { clientMessageId: randomUUID(), text: '  \n  ' },
      { clientMessageId: randomUUID(), text: '😀'.repeat(2001) },
    ]) await api().post(`${path}/messages`).set('authorization', 'Bearer token-a').send(body).expect(400);
    await api().post(`${path}/messages`).set('authorization', 'Bearer token-a').send({ clientMessageId: randomUUID(), text: '😀'.repeat(2000) }).expect(200);
    await api().get(`${path}/messages?before=1&after=0`).set('authorization', 'Bearer token-a').expect(400);
    await api().get(`${path}/messages?limit=101`).set('authorization', 'Bearer token-a').expect(400);
    await api().get('/chat/conversations?cursor=not-json').set('authorization', 'Bearer token-a').expect(400);
    await api().get(`${path}/messages`).set('authorization', 'Bearer token-c').expect(404);
    await api().patch(`${path}/read`).set('authorization', 'Bearer token-c').send({ sequence: '1' }).expect(404);
    await api().post(`${path}/messages`).set('authorization', 'Bearer token-c').send({ clientMessageId: randomUUID(), text: 'intruder' }).expect(404);
  });
  it('fails closed for new interactions after unfriend but allows participant history', async () => {
    const id = await open();
    await api().post(`/chat/conversations/${id}/messages`).set('authorization', 'Bearer token-a').send({ clientMessageId: randomUUID(), text: 'history' }).expect(200);
    friends = false;
    await api().post(`/chat/conversations/${id}/messages`).set('authorization', 'Bearer token-a').send({ clientMessageId: randomUUID(), text: 'blocked' }).expect(403);
    await api().get(`/chat/conversations/${id}/messages`).set('authorization', 'Bearer token-b').expect(200);
    const detail = await api().get(`/chat/conversations/${id}`).set('authorization', 'Bearer token-b').expect(200);
    expect(detail.body.conversation.canInteract).toBe(false); expect(detail.body.conversation.peer).toBeNull();
    authorityDown = true; await api().get('/chat/conversations').set('authorization', 'Bearer token-a').expect(503);
  });
  it('delivers HTTP-committed messages to a real socket and recovers offline history without duplication', async () => {
    const id = await open(); const socket = await connect('token-b');
    try {
      const received = new Promise<Record<string, any>>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('No committed message event')), 3000);
        socket.once('message:new', (event: Record<string, any>) => { clearTimeout(timer); resolve(event); });
      });
      const input = { clientMessageId: randomUUID(), text: 'realtime PostgreSQL message' };
      const sent = await api().post(`/chat/conversations/${id}/messages`).set('authorization', 'Bearer token-a').send(input).expect(200);
      const event = await received;
      expect(event.message.id).toBe(sent.body.message.id);
      expect((await db.query('SELECT text FROM messages WHERE id=$1', [event.message.id]))[0].text).toBe(input.text);
      socket.disconnect();
      await api().post(`/chat/conversations/${id}/messages`).set('authorization', 'Bearer token-a').send({ clientMessageId: randomUUID(), text: 'sent while peer was offline' }).expect(200);
      const reconnected = await connect('token-b');
      try {
        const missed = await api().get(`/chat/conversations/${id}/messages?after=1`).set('authorization', 'Bearer token-b').expect(200);
        expect(missed.body.data.map((m: { sequence: string }) => m.sequence)).toEqual(['2']);
        await api().post(`/chat/conversations/${id}/messages`).set('authorization', 'Bearer token-a').send(input).expect(200);
        expect((await db.query('SELECT count(*)::int n FROM messages WHERE conversation_id=$1', [id]))[0].n).toBe(2);
      } finally { reconnected.disconnect(); }
    } finally { socket.disconnect(); }
  });
  it('enforces the send quota at Chat Service even when called without the gateway', async () => {
    const opened = await api().post('/chat/conversations/direct').set('authorization', 'Bearer token-c').send({ peerId: b }).expect(200);
    const path = `/chat/conversations/${opened.body.conversation.id}/messages`;
    for (let n = 0; n < 30; n++) await api().post(path).set('authorization', 'Bearer token-c').send({ clientMessageId: randomUUID(), text: `${n}` }).expect(200);
    await api().post(path).set('authorization', 'Bearer token-c').send({ clientMessageId: randomUUID(), text: 'over quota' }).expect(429);
    expect((await db.query('SELECT count(*)::int n FROM messages WHERE sender_id=$1', [c]))[0].n).toBe(30);
  });
});
