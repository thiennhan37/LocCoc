import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { ServiceProxyController } from '../src/service-proxy.controller.js';
import { configureGateway } from '../src/bootstrap.js';

describe('unified Python AI boundary', () => {
  let app: INestApplication;
  const upstream = vi.fn<typeof fetch>();
  const token = 'trusted-ai-service-token-32-characters';
  let config: Record<string, string>;
  beforeEach(async () => {
    vi.stubGlobal('fetch', upstream);
    upstream.mockReset().mockResolvedValue(new Response(new Uint8Array([137,80,78,71]), {
      status: 200, headers: { 'content-type': 'image/png', 'cache-control': 'no-store' },
    }));
    config = { AI_SERVICE_URL: 'http://python-ai:8087', AI_SERVICE_TOKEN: token, CORS_ORIGINS: 'https://app.test' };
    const module = await Test.createTestingModule({
      controllers: [ServiceProxyController], providers: [{ provide: ConfigService, useValue: {
        get: (key: string) => config[key], getOrThrow: (key: string) => config[key],
      } }],
    }).compile();
    app = module.createNestApplication(); configureGateway(app); await app.init();
  });
  afterEach(async () => { vi.unstubAllGlobals(); await app.close(); });
  it('forwards the existing multipart contract and replaces caller service credentials', async () => {
    await request(app.getHttpServer()).post('/ai/images/enhance')
      .set('x-service-token','spoof').set('x-ai-actor','spoof').set('x-ai-metadata','spoof')
      .field('filterId','subject_sticker').attach('image',Buffer.from([1,2,3]),{filename:'photo.png',contentType:'image/png'})
      .expect(200).expect('content-type','image/png');
    const [url, init] = upstream.mock.calls[0]!;
    expect(String(url)).toBe('http://python-ai:8087/ai/images/enhance');
    const headers = init!.headers as Headers;
    expect(headers.get('x-service-token')).toBe(token);
    expect(headers.get('content-type')).toContain('multipart/form-data; boundary=');
    expect(headers.has('x-ai-actor')).toBe(false); expect(headers.has('x-ai-metadata')).toBe(false);
    expect(init!.duplex).toBe('half');
  });
  it('never exposes internal search/index paths', async () => {
    await request(app.getHttpServer()).post('/ai/internal/search').send({query:'x'}).expect(404);
    await request(app.getHttpServer()).put('/ai/internal/assets/id/1').send('x').expect(404);
    expect(upstream).not.toHaveBeenCalled();
  });
  it('fails closed before provider forwarding if Gateway has no configured service token', async () => {
    delete config.AI_SERVICE_TOKEN;
    await request(app.getHttpServer()).post('/ai/images/enhance').send('x').expect(503);
    expect(upstream).not.toHaveBeenCalled();
  });
});
