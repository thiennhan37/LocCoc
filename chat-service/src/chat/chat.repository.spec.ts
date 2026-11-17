import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { ChatRepository } from './chat.repository.js';

const accountId = '12345678-1234-4234-8234-123456789abc';
const conversationId = '22345678-1234-4234-8234-123456789abc';
const postId = '32345678-1234-4234-8234-123456789abc';
const clientId = '42345678-1234-4234-8234-123456789abc';
const postAttachment = { postId, mediaKey: '/posts/media/52345678-1234-4234-8234-123456789abc' };
const existing = { id: clientId, conversationId, senderId: accountId, clientMessageId: clientId, text: 'hello', sequence: '1', createdAt: '2026-11-16T00:00:00.000Z', postAttachment };
function repository(row: unknown) {
  const tx = { query: async (sql: string) => {
    if (sql.startsWith('SELECT 1')) return [{}];
    if (sql.includes('pg_advisory')) return [];
    if (sql.includes('FROM messages WHERE sender_id')) return row ? [row] : [];
    throw new Error(`Unexpected query: ${sql}`);
  } };
  return new ChatRepository({ transaction: async (run: (tx: unknown) => unknown) => run(tx) } as unknown as DataSource);
}
it('returns the committed attachment on retry without resolving a deleted source again', async () => {
  const repo = repository(existing);
  const resolve = async () => { throw new Error('Source was deleted'); };
  expect(await repo.send(accountId, conversationId, clientId, 'hello', { postId: postId.toUpperCase(), resolve })).toEqual({ message: existing, created: false });
});
it.each([undefined, '62345678-1234-4234-8234-123456789abc'])('rejects changed or removed post context on retry (%s)', async changedId => {
  const repo = repository(existing);
  await expect(repo.send(accountId, conversationId, clientId, 'hello', changedId ? { postId: changedId, resolve: async () => postAttachment } : undefined)).rejects.toMatchObject({ status: 409 });
});
it('rejects adding a post to an existing text-only message', async () => {
  const repo = repository({ ...existing, postAttachment: null });
  await expect(repo.send(accountId, conversationId, clientId, 'hello', { postId, resolve: async () => postAttachment })).rejects.toMatchObject({ status: 409 });
});
