import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { validateGatewayEnvironment } from '@loccoc/common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { ServiceProxyController } from '../src/service-proxy.controller.js';
import { configureGateway } from '../src/bootstrap.js';

const gatewayInput = {
  NODE_ENV: 'test',
  REDIS_URL: 'redis://127.0.0.1:6379',
  CORS_ORIGINS: 'http://localhost:3000',
};

describe.each([
  { name: 'local defaults', overrides: {}, admin: 'http://127.0.0.1:8086', payment: 'http://127.0.0.1:8085' },
  {
    name: 'explicit gateway URLs',
    overrides: { ADMIN_SERVICE_URL: 'http://admin-service:9086', PAYMENT_SERVICE_URL: 'https://payment.example:9085' },
    admin: 'http://admin-service:9086', payment: 'https://payment.example:9085',
  },
])('business routing with $name', ({ overrides, admin, payment }) => {
  let app: INestApplication;
  let upstream: ReturnType<typeof vi.fn<typeof fetch>>;

  beforeEach(async () => {
    upstream = vi.fn<typeof fetch>().mockResolvedValue(new Response('{"ok":true}', {
      headers: { 'content-type': 'application/json' },
    }));
    vi.stubGlobal('fetch', upstream);
    const config = new ConfigService(validateGatewayEnvironment({ ...gatewayInput, ...overrides }));
    const module = await Test.createTestingModule({
      controllers: [ServiceProxyController],
      providers: [{ provide: ConfigService, useValue: config }],
    }).compile();
    app = module.createNestApplication();
    configureGateway(app);
    await app.init();
  });

  afterEach(async () => { vi.unstubAllGlobals(); await app?.close(); });

  it.each([
    ['/admin/tiers', 'admin'],
    ['/payments/orders', 'payment'],
    ['/subscriptions/me', 'payment'],
  ])('forwards %s with its configured URL and query', async (path, service) => {
    await request(app.getHttpServer()).get(`${path}?page=2`).expect(200, { ok: true });
    const [url, init] = upstream.mock.calls[0];
    expect(String(url)).toBe(`${service === 'admin' ? admin : payment}${path}?page=2`);
    expect(init?.method).toBe('GET');
  });

  it('returns 502 when Payment is unavailable', async () => {
    upstream.mockRejectedValueOnce(new Error('connection refused'));
    const response = await request(app.getHttpServer()).get('/payments/orders').expect(502);
    expect(response.body).toMatchObject({ statusCode: 502, message: 'Upstream service unavailable' });
  });
});

describe('business upstream configuration validation', () => {
  it.each(['ADMIN_SERVICE_URL', 'PAYMENT_SERVICE_URL'])('rejects invalid %s before serving requests', (key) => {
    expect(() => validateGatewayEnvironment({ ...gatewayInput, [key]: 'not-a-url' })).toThrow(key);
    expect(() => validateGatewayEnvironment({ ...gatewayInput, [key]: 'ftp://upstream.example' })).toThrow(key);
  });
});
