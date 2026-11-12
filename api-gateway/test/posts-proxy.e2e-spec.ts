import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { vi } from 'vitest';
import { ServiceProxyController } from '../src/service-proxy.controller.js';
import { configureGateway } from '../src/bootstrap.js';

describe('Post proxy routes', () => {
  let app: INestApplication;
  const upstream = vi.fn();

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [ServiceProxyController],
      providers: [{ provide: ConfigService, useValue: { getOrThrow: () => 'http://localhost:8087' } }],
    }).compile();
    app = module.createNestApplication();
    configureGateway(app);
    app.use((req: { requestId: string }, _res: unknown, next: () => void) => {
      req.requestId = 'post-test'; next();
    });
    await app.init();
    vi.stubGlobal('fetch', upstream);
  });

  afterAll(async () => { vi.unstubAllGlobals(); await app.close(); });

  it('forwards POST /posts with its JSON body and no token', async () => {
    upstream.mockResolvedValueOnce(new Response('{"id":"post-id"}', { status: 201 }));
    await request(app.getHttpServer()).post('/posts').send({ mediaType: 0 }).expect(201);
    const [url, options] = upstream.mock.calls.at(-1)!;
    expect(url.toString()).toBe('http://localhost:8087/posts');
    expect(options.body).toBe('{"mediaType":0}');
    expect(options.headers.has('authorization')).toBe(false);
  });

  it('forwards deletion and owner query', async () => {
    upstream.mockResolvedValueOnce(new Response(null, { status: 204 }));
    await request(app.getHttpServer()).delete('/posts/post-id?ownerId=owner-id').expect(204);
    const [url, options] = upstream.mock.calls.at(-1)!;
    expect(url.toString()).toBe('http://localhost:8087/posts/post-id?ownerId=owner-id');
    expect(options.method).toBe('DELETE');
  });

  it('forwards photo JSON larger than the former body limit', async () => {
    const imageBase64 = 'A'.repeat(1500000);
    upstream.mockResolvedValueOnce(new Response('{"id":"post-id"}', { status: 201 }));
    await request(app.getHttpServer()).post('/posts/photos').send({ imageBase64 }).expect(201);
    const [url, options] = upstream.mock.calls.at(-1)!;
    expect(url.toString()).toBe('http://localhost:8087/posts/photos');
    expect(JSON.parse(options.body).imageBase64).toBe(imageBase64);
  });
});
