import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { vi } from 'vitest';
import { ServiceProxyController } from '../src/service-proxy.controller.js';
import { configureGateway } from '../src/bootstrap.js';
import { APP_GUARD } from '@nestjs/core';
import { AccountAuthorityClient } from '@loccoc/common';
import { GatewayAccountAccessGuard } from '../src/account-access.guard.js';

describe('Post proxy routes', () => {
  let app: INestApplication;
  const upstream = vi.fn();

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [ServiceProxyController],
      providers: [
        { provide: ConfigService, useValue: { getOrThrow: () => 'http://localhost:8089' } },
        { provide: AccountAuthorityClient, useValue: { access: () => { throw new Error('Posts must remain public during local development'); } } },
        { provide: APP_GUARD, useClass: GatewayAccountAccessGuard },
      ],
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
    expect(url.toString()).toBe('http://localhost:8089/posts');
    expect(options.body).toBe('{"mediaType":0}');
    expect(options.headers.has('authorization')).toBe(false);
  });

  it('forwards deletion and owner query', async () => {
    upstream.mockResolvedValueOnce(new Response(null, { status: 204 }));
    await request(app.getHttpServer()).delete('/posts/post-id?ownerId=owner-id').expect(204);
    const [url, options] = upstream.mock.calls.at(-1)!;
    expect(url.toString()).toBe('http://localhost:8089/posts/post-id?ownerId=owner-id');
    expect(options.method).toBe('DELETE');
  });
  it('forwards authenticated feed cursor and seen updates to post-service', async () => {
    upstream.mockResolvedValueOnce(new Response('{"data":[],"nextCursor":null}'));
    await request(app.getHttpServer()).get('/posts/feed?limit=20&cursor=opaque').set('Authorization','Bearer viewer').expect(200);
    let [url, options] = upstream.mock.calls.at(-1)!;
    expect(url.toString()).toBe('http://localhost:8089/posts/feed?limit=20&cursor=opaque');
    expect(options.headers.get('authorization')).toBe('Bearer viewer');
    upstream.mockResolvedValueOnce(new Response(null,{status:204}));
    await request(app.getHttpServer()).put('/posts/post-id/seen').set('Authorization','Bearer viewer').expect(204);
    [url, options] = upstream.mock.calls.at(-1)!;
    expect(url.toString()).toBe('http://localhost:8089/posts/post-id/seen');
    expect(options.method).toBe('PUT');
  });

  it('preserves photo authentication rejection from post-service', async () => {
    upstream.mockResolvedValueOnce(new Response('{"code":1001}', { status: 401 }));
    await request(app.getHttpServer()).post('/posts/photos').send({}).expect(401);
  });

  it('forwards the protected JPEG preview query and binary response', async () => {
    const bytes = Buffer.from([255, 216, 255, 217]);
    upstream.mockResolvedValueOnce(new Response(bytes, {
      headers: { 'content-type': 'image/jpeg', 'cache-control': 'no-store' },
    }));
    const response = await request(app.getHttpServer())
      .get('/posts/media/post-id?preview=true').set('Authorization', 'Bearer viewer')
      .expect(200).expect('Content-Type', /image\/jpeg/).expect('Cache-Control', 'no-store');
    expect(response.body).toEqual(bytes);
    const [url, options] = upstream.mock.calls.at(-1)!;
    expect(url.toString()).toBe('http://localhost:8089/posts/media/post-id?preview=true');
    expect(options.headers.get('authorization')).toBe('Bearer viewer');
  });

  it('forwards photo JSON larger than the former body limit', async () => {
    const imageBase64 = 'A'.repeat(1500000);
    upstream.mockResolvedValueOnce(new Response('{"id":"post-id"}', { status: 201 }));
    await request(app.getHttpServer()).post('/posts/photos').set('Authorization', 'Bearer photo-token').send({ imageBase64 }).expect(201);
    const [url, options] = upstream.mock.calls.at(-1)!;
    expect(url.toString()).toBe('http://localhost:8089/posts/photos');
    expect(JSON.parse(options.body).imageBase64).toBe(imageBase64);
    expect(options.headers.get('authorization')).toBe('Bearer photo-token');
  });
});
