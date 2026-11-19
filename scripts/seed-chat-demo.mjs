// Local-only chat fixtures for the profiles created by seed-feed-demo.cjs.
// Reuses production openDirect: reruns cannot duplicate a conversation/member.
import { readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
const require = createRequire(new URL('../chat-service/package.json', import.meta.url));
require('reflect-metadata');
const { DataSource } = require('typeorm');
const { ConfigService } = require('@nestjs/config');
const { chatDatabaseOptions, validateChatEnvironment } = await import('../chat-service/dist/config.js');
const { ChatRepository } = await import('../chat-service/dist/chat/chat.repository.js');
const viewer = '11111111-1111-4111-8111-111111111111';
const peers = [
  ['ad108a00-1450-4000-8000-000000000001', 'seed_minh_an'],
  ['ad108a00-1450-4000-8000-000000000002', 'seed_thao_vy'],
  ['ad108a00-1450-4000-8000-000000000003', 'seed_hoang_nam'],
];
const connections = [];
try {
  const env = validateChatEnvironment(parseEnv(readFileSync(new URL('../chat-service/.env', import.meta.url), 'utf8')));
  if (env.DB_HOST !== '127.0.0.1' || Number(env.DB_PORT) !== 5433 || env.CHAT_DB_NAME !== 'chat') throw new Error('Expected local chat database');
  const password = execFileSync('docker', ['exec', 'loccoc-postgres', 'printenv', 'POSTGRES_PASSWORD'], { encoding: 'utf8', windowsHide: true }).trim();
  async function connect(options) {
    const db = await new DataSource({ ...options, logging: false }).initialize();
    connections.push(db); return db;
  }
  const local = { type: 'postgres', host: '127.0.0.1', port: 5433, username: 'postgres', password };
  const users = await connect({ ...local, database: 'users' });
  const accounts = await connect({ ...local, database: 'accounts' });
  for (const [id, username] of [[viewer, 'phatran17'], ...peers]) {
    const [profile] = await users.query('SELECT username,account_status,deleted_at FROM users WHERE id=$1', [id]);
    const [account] = await accounts.query('SELECT status FROM accounts WHERE id=$1', [id]);
    if (profile?.username !== username || profile.account_status !== 'active' || profile.deleted_at || account?.status !== 'active') throw new Error('Fixture profile missing or inactive');
  }
  for (const [id] of peers) {
    const friends = await users.query('SELECT 1 FROM friendships WHERE user_low_id=LEAST($1::uuid,$2::uuid) AND user_high_id=GREATEST($1::uuid,$2::uuid)', [viewer, id]);
    const blocks = await users.query('SELECT 1 FROM user_blocks WHERE (blocker_id=$1 AND blocked_id=$2) OR (blocker_id=$2 AND blocked_id=$1)', [viewer, id]);
    if (!friends.length || blocks.length) throw new Error('Fixture friendship unavailable; no relationship changes made');
  }
  const chat = await connect({ ...chatDatabaseOptions(new ConfigService(env)), migrationsRun: false });
  if (await chat.showMigrations()) throw new Error('Run chat migrations first');
  const repo = new ChatRepository(chat);
  for (const [id, username] of peers) {
    const conversationId = await repo.openDirect(viewer, id);
    const members = await chat.query('SELECT count(*)::int AS n FROM conversation_members WHERE conversation_id=$1', [conversationId]);
    if (members[0].n !== 2) throw new Error('Unexpected membership count');
    console.log(JSON.stringify({ peer: username, conversationId, members: 2 }));
  }
  console.log('Chat fixtures ready. No messages, login credentials or friendships were changed.');
} catch (error) {
  // Do not print connection options, SQL parameters, passwords or tokens.
  console.error('Chat fixture setup failed: ' + (error.code ?? (error.message?.startsWith('Fixture') || error.message?.startsWith('Run chat') || error.message?.startsWith('Expected') ? error.message : 'check local services and configuration')));
  process.exitCode = 1;
} finally {
  for (const db of connections.reverse()) await db.destroy().catch(() => {});
}
