import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { validateGatewayEnvironment } from '@loccoc/common';
import request from 'supertest';
import { ServiceProxyController } from '../src/service-proxy.controller.js';
import { configureGateway } from '../src/bootstrap.js';

const input = { NODE_ENV: 'test', REDIS_URL: 'redis://127.0.0.1:6379', CORS_ORIGINS: 'http://localhost:3000' };
describe.each([undefined, 'http://chat.internal:9083'])('chat REST routing with upstream %s', upstreamUrl => {
  let app: INestApplication;
  const fetchMock = vi.fn<typeof fetch>();
  beforeEach(async () => {
    fetchMock.mockReset().mockResolvedValue(new Response('{"message":{"sequence":"1"}}', { headers: { 'content-type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);
    const config = new ConfigService(validateGatewayEnvironment({ ...input, ...(upstreamUrl ? { CHAT_SERVICE_URL: upstreamUrl } : {}) }));
    const module = await Test.createTestingModule({ controllers: [ServiceProxyController], providers: [{ provide: ConfigService, useValue: config }] }).compile();
    app = module.createNestApplication({ logger: false }); configureGateway(app); await app.init();
  });
  afterEach(async () => { await app?.close(); vi.unstubAllGlobals(); });
  it('preserves POST body and Bearer while stripping caller identity on the chat route', async () => {
    const body = { clientMessageId: '00000000-0000-4000-8000-000000000001', text: 'xin chào' };
    const response = await request(app.getHttpServer()).post('/chat/conversations/id/messages?limit=2')
      .set('authorization', 'Bearer real-token').set('x-user-id', 'forged').send(body).expect(200);
    expect(response.body.message.sequence).toBe('1');
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe(`${upstreamUrl ?? 'http://127.0.0.1:8083'}/chat/conversations/id/messages?limit=2`);
    expect(init?.body).toBe(JSON.stringify(body));
    const headers = init?.headers as Headers;
    expect(headers.get('authorization')).toBe('Bearer real-token'); expect(headers.has('x-user-id')).toBe(false);
  });
});
it('rejects invalid chat upstream schemes before serving requests', () => {
  expect(() => validateGatewayEnvironment({ ...input, CHAT_SERVICE_URL: 'file:///tmp/chat' })).toThrow('CHAT_SERVICE_URL');
});
