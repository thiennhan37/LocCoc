import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { ChatRepository } from '../src/chat/chat.repository.js';
import { CreateChat1794528000000 } from '../src/database/migrations/1794528000000-CreateChat.js';

const url = process.env.CHAT_TEST_DB_URL;
describe.skipIf(!url)('chat repository on isolated PostgreSQL', () => {
  let admin: DataSource, db: DataSource, repo: ChatRepository;
  const schema = `chat_test_${randomUUID().replaceAll('-', '')}`;
  const [a, b, c] = [randomUUID(), randomUUID(), randomUUID()];
  beforeAll(async () => {
    admin = await new DataSource({ type: 'postgres', url }).initialize();
    await admin.query(`CREATE SCHEMA "${schema}"`);
    db = await new DataSource({ type: 'postgres', url, schema, extra: { options: `-c search_path=${schema}` }, migrations: [CreateChat1794528000000], migrationsRun: true }).initialize();
    repo = new ChatRepository(db);
  });
  afterAll(async () => { if (db?.isInitialized) await db.destroy(); if (admin?.isInitialized) { await admin.query(`DROP SCHEMA "${schema}" CASCADE`); await admin.destroy(); } });
  beforeEach(async () => { await db.query('TRUNCATE conversations CASCADE'); });

  it('opens one conversation and two members when both accounts start simultaneously', async () => {
    const opened = await Promise.all([repo.openDirect(a!, b!), repo.openDirect(b!, a!)]);
    expect(opened[0]).toBe(opened[1]);
    expect((await db.query('SELECT count(*)::int n FROM conversation_members'))[0].n).toBe(2);
  });
  it('deduplicates concurrent retry and refuses changed payload or conversation', async () => {
    const id = await repo.openDirect(a!, b!); const clientId = randomUUID();
    const results = await Promise.all([repo.send(a!, id, clientId, 'xin chào'), repo.send(a!, id, clientId, 'xin chào')]);
    expect(results[0]!.message.id).toBe(results[1]!.message.id);
    expect(results.filter(r => r.created)).toHaveLength(1);
    expect((await db.query('SELECT count(*)::int n FROM messages'))[0].n).toBe(1);
    await expect(repo.send(a!, id, clientId, 'changed')).rejects.toMatchObject({ status: 409 });
    const other = await repo.openDirect(a!, c!);
    await expect(repo.send(a!, other, clientId, 'xin chào')).rejects.toMatchObject({ status: 409 });
  });
  it('enforces participant access and monotonic read cursors on real rows', async () => {
    const id = await repo.openDirect(a!, b!);
    await expect(repo.member(c!, id)).rejects.toMatchObject({ status: 404 });
    await expect(repo.send(c!, id, randomUUID(), 'intruder')).rejects.toMatchObject({ status: 404 });
    for (const text of ['one', 'two', 'three']) await repo.send(a!, id, randomUUID(), text);
    expect(await repo.read(b!, id, '3')).toMatchObject({ lastReadSequence: '3', unreadCount: 0 });
    expect(await repo.read(b!, id, '1')).toMatchObject({ lastReadSequence: '3', unreadCount: 0 });
    await expect(repo.read(b!, id, '99')).rejects.toMatchObject({ status: 400 });
    expect((await repo.member(a!, id)).peerLastReadSequence).toBe('3');
  });
  it('retries the same uppercase conversation path without conflicting with canonical UUIDs', async () => {
    const id = await repo.openDirect(a!, b!); const clientId = randomUUID();
    const first = await repo.send(a!, id.toUpperCase(), clientId, 'same request');
    const retry = await repo.send(a!, id.toUpperCase(), clientId, 'same request');
    expect(retry).toEqual({ message: first.message, created: false });
  });
  it('serializes client UUID retries across upper and lower case spellings', async () => {
    const id = await repo.openDirect(a!, b!); const clientId = randomUUID();
    const results = await Promise.all([
      repo.send(a!, id, clientId.toUpperCase(), 'same message'),
      repo.send(a!, id, clientId.toLowerCase(), 'same message'),
    ]);
    expect(results[0]!.message.id).toBe(results[1]!.message.id);
    expect(results.filter(r => r.created)).toHaveLength(1);
    expect((await db.query('SELECT count(*)::int n FROM messages'))[0].n).toBe(1);
  });
  it('keeps sequences ordered, excludes own messages from unread and paginates without gaps', async () => {
    const id = await repo.openDirect(a!, b!);
    await Promise.all(Array.from({ length: 8 }, (_, i) => repo.send(a!, id, randomUUID(), `${i}`)));
    const newest = await repo.history(b!, id, { limit: 3 });
    expect(newest.data.map(m => m.sequence)).toEqual(['6', '7', '8']);
    expect(newest.hasMore).toBe(true);
    const older = await repo.history(b!, id, { limit: 3, before: '6' });
    expect(older.data.map(m => m.sequence)).toEqual(['3', '4', '5']);
    const missed = await repo.history(b!, id, { limit: 3, after: '3' });
    expect(missed.data.map(m => m.sequence)).toEqual(['4', '5', '6']);
    expect(missed.hasMore).toBe(true);
    expect((await repo.member(a!, id)).unreadCount).toBe(0);
    expect((await repo.member(b!, id)).unreadCount).toBe(8);
  });
  it('recovers committed history using a new database connection and repository instance', async () => {
    const id = await repo.openDirect(a!, b!);
    const sent = await repo.send(a!, id, randomUUID(), 'survives reconnect');
    await db.destroy();
    db = await new DataSource({ type: 'postgres', url, schema, extra: { options: `-c search_path=${schema}` }, migrations: [CreateChat1794528000000], migrationsRun: true }).initialize();
    repo = new ChatRepository(db);
    expect((await repo.history(b!, id, { limit: 25 })).data).toEqual([sent.message]);
  });
});
