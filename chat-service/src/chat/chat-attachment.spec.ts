import 'reflect-metadata';
import { ConfigService } from '@nestjs/config';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ChatPolicy } from './chat.policy.js';
import { SendMessageDto } from './chat.dto.js';

const postId = '12345678-1234-4234-8234-123456789abc';
const peerId = '22345678-1234-4234-8234-123456789abc';
const mediaKey = '/posts/media/32345678-1234-4234-8234-123456789abc';
const policy = new ChatPolicy(new ConfigService({ POST_SERVICE_URL: 'http://post.local' }));
afterEach(() => vi.unstubAllGlobals());
it('accepts optional post UUID but rejects arbitrary client image URLs and invalid IDs', async () => {
  const base = { clientMessageId: postId, text: 'hello' };
  expect(await validate(plainToInstance(SendMessageDto, { ...base, postId }), { whitelist: true, forbidNonWhitelisted: true })).toEqual([]);
  expect(await validate(plainToInstance(SendMessageDto, { ...base, postId: 'bad' }))).not.toEqual([]);
  expect(await validate(plainToInstance(SendMessageDto, { ...base, mediaKey }), { whitelist: true, forbidNonWhitelisted: true })).not.toEqual([]);
});
it('verifies with caller bearer and returns only trusted stable attachment metadata', async () => {
  vi.stubGlobal('fetch', async (url: string, options: RequestInit) => {
    expect(url).toBe(`http://post.local/posts/${postId}/chat-reference`);
    expect(options.headers).toEqual({ authorization: 'Bearer caller' });
    expect(options.redirect).toBe('error');
    return Response.json({ postId, ownerId: peerId, mediaKey });
  });
  expect(await policy.postAttachment('Bearer caller', postId, peerId)).toEqual({ postId, mediaKey });
});
it.each([401, 403, 404, 500])('fails closed for upstream status %s', async status => {
  vi.stubGlobal('fetch', async () => new Response('{}', { status }));
  await expect(policy.postAttachment('Bearer caller', postId, peerId)).rejects.toMatchObject({ status: status === 401 ? 401 : status === 500 ? 503 : 403 });
});
it.each([
  { postId, ownerId: postId, mediaKey },
  { postId: peerId, ownerId: peerId, mediaKey },
  { postId, ownerId: peerId, mediaKey: 'https://evil.test/image.jpg' },
  { postId, ownerId: peerId, mediaKey: '/posts/media/../secret' },
  { postId, ownerId: peerId, mediaKey: `${mediaKey}?token=secret` },
  null,
])('rejects untrusted reference %j', async data => {
  vi.stubGlobal('fetch', async () => Response.json(data));
  await expect(policy.postAttachment('Bearer caller', postId, peerId)).rejects.toThrow();
});
it('fails closed when post service is unreachable', async () => {
  vi.stubGlobal('fetch', async () => { throw new Error('connection failed'); });
  await expect(policy.postAttachment('Bearer caller', postId, peerId)).rejects.toMatchObject({ status: 503 });
});
