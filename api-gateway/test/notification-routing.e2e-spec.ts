import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import { ServiceProxyController } from '../src/service-proxy.controller.js';
import { configureGateway } from '../src/bootstrap.js';
describe('notification gateway routing', () => {
  it('forwards root, cursor query, seen and device routes while stripping spoofed identity', async () => {
    const upstream = vi.fn().mockImplementation(
      async () =>
        new Response('{"ok":true}', {
          headers: { 'content-type': 'application/json' },
        }),
    );
    vi.stubGlobal('fetch', upstream);
    const module = await Test.createTestingModule({
      controllers: [ServiceProxyController],
      providers: [
        {
          provide: ConfigService,
          useValue: new ConfigService({
            NOTIFICATION_SERVICE_URL: 'http://notification:8084',
            CORS_ORIGINS: 'http://localhost:3000',
          }),
        },
      ],
    }).compile();
    const app = module.createNestApplication();
    configureGateway(app);
    await app.init();
    try {
      await request(app.getHttpServer())
        .get('/notifications?limit=20&cursor=test')
        .set('x-user-id', 'spoof')
        .expect(200);
      expect(String(upstream.mock.calls[0][0])).toBe(
        'http://notification:8084/notifications/?limit=20&cursor=test',
      );
      expect(upstream.mock.calls[0][1].headers.get('x-user-id')).toBeNull();
      await request(app.getHttpServer())
        .patch('/notifications/seen')
        .send({ seenCursor: 'signed' })
        .expect(200);
      expect(String(upstream.mock.calls[1][0])).toBe(
        'http://notification:8084/notifications/seen',
      );
      await request(app.getHttpServer())
        .delete('/notifications/devices/id')
        .expect(200);
      expect(upstream.mock.calls[2][1].method).toBe('DELETE');
    } finally {
      await app.close();
      vi.unstubAllGlobals();
    }
  });
});
