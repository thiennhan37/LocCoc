import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { ServiceProxyController } from '../src/service-proxy.controller.js';
import { configureGateway } from '../src/bootstrap.js';

describe('social login gateway routing', () => {
  let app: INestApplication;
  let upstream: ReturnType<typeof vi.fn<typeof fetch>>;

  beforeEach(async () => {
    upstream = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({
      authenticated: true, accessToken: 'local-access', refreshToken: 'local-refresh',
    }), { status: 200, headers: { 'content-type': 'application/json' } }));
    vi.stubGlobal('fetch', upstream);
    const config: Record<string, string> = {
      AUTH_SERVICE_URL: 'http://auth-service:8000', CORS_ORIGINS: 'http://localhost:3000',
    };
    const module = await Test.createTestingModule({
      controllers: [ServiceProxyController],
      providers: [{ provide: ConfigService, useValue: { getOrThrow: (key: string) => config[key] } }],
    }).compile();
    app = module.createNestApplication();
    configureGateway(app);
    await app.init();
  });

  afterEach(async () => { vi.unstubAllGlobals(); await app?.close(); });

  it.each(['google', 'apple'])('forwards POST /auth/social/%s through the existing auth route', async (provider) => {
    const body = { idToken: 'provider-token', nonce: 'mobile-nonce' };
    const response = await request(app.getHttpServer()).post(`/auth/social/${provider}`)
      .send(body).expect(200);
    expect(response.body).toMatchObject({ authenticated: true, accessToken: 'local-access', refreshToken: 'local-refresh' });
    const [url, init] = upstream.mock.calls[0];
    expect(String(url)).toBe(`http://auth-service:8000/auth/social/${provider}`);
    expect(init).toMatchObject({ method: 'POST', body: JSON.stringify(body) });
  });
});
