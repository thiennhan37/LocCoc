import { generateKeyPairSync } from 'node:crypto';
import { createServer, request as httpRequest, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { Test } from '@nestjs/testing';
import { type INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { configureGateway } from '../src/bootstrap.js';
import { RedisThrottlerStorage } from '../src/redis-throttler.storage.js';

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason: unknown) => void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function readBody(requestMessage: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    requestMessage.on('data', (chunk: Buffer) => chunks.push(Buffer.from(chunk)));
    requestMessage.on('end', () => resolve(Buffer.concat(chunks)));
    requestMessage.on('error', reject);
  });
}

function withTimeout<T>(promise: Promise<T>, message: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_resolve, reject) => setTimeout(() => reject(new Error(message)), 2_000)),
  ]);
}

const binaryParser = (response: any, callback: (error: Error | null, body?: Buffer) => void) => {
  const chunks: Buffer[] = [];
  response.on('data', (chunk: Buffer) => chunks.push(Buffer.from(chunk)));
  response.on('end', () => callback(null, Buffer.concat(chunks)));
  response.on('error', callback);
};

describe('IAM gateway security contract (e2e)', () => {
  let app: INestApplication;
  let upstream: Server;
  let upstreamUrl: string;
  let gatewayPort: number;
  let multipartCapture = deferred<{ body: Buffer; contentType: string; requestId: string }>();
  let jsonCapture = deferred<Buffer>();
  let releaseStream = deferred<void>();
  let upstreamAbort = deferred<void>();
  const storageHits = new Map<string, number>();
  const storageIncrement = vi.fn(async (key: string, ttl: number, limit: number, _blockDuration: number, name: string) => {
    const storageKey = `${name}:${key}`;
    const totalHits = (storageHits.get(storageKey) ?? 0) + 1;
    storageHits.set(storageKey, totalHits);
    return {
      totalHits,
      timeToExpire: Math.ceil(ttl / 1000),
      isBlocked: totalHits > limit,
      timeToBlockExpire: totalHits > limit ? Math.ceil(ttl / 1000) : 0,
    };
  });

  beforeAll(async () => {
    const image = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x01, 0x02, 0x03]);
    upstream = createServer((requestMessage, responseMessage) => {
      void (async () => {
        if (requestMessage.url === '/ai/enhance') {
          const body = await readBody(requestMessage);
          multipartCapture.resolve({
            body,
            contentType: String(requestMessage.headers['content-type']),
            requestId: String(requestMessage.headers['x-request-id']),
          });
          responseMessage.writeHead(200, {
            'content-type': 'image/png',
            'cache-control': 'no-store',
            'x-upstream-safe': 'kept',
            connection: 'x-upstream-hop',
            'x-upstream-hop': 'removed',
          });
          responseMessage.end(image);
          return;
        }

        if (requestMessage.url === '/ai/stream') {
          responseMessage.writeHead(200, { 'content-type': 'image/png', 'cache-control': 'no-store' });
          responseMessage.write(image.subarray(0, 5));
          await releaseStream.promise;
          responseMessage.end(image.subarray(5));
          return;
        }

        if (requestMessage.url === '/ai/abort') {
          responseMessage.writeHead(200, { 'content-type': 'image/png', 'cache-control': 'no-store' });
          responseMessage.write(image.subarray(0, 5));
          const fallback = setTimeout(() => responseMessage.end(), 2_000);
          responseMessage.once('close', () => {
            clearTimeout(fallback);
            upstreamAbort.resolve();
          });
          return;
        }

        if (requestMessage.url === '/ai/failure') {
          requestMessage.socket.destroy();
          return;
        }

        if (requestMessage.url === '/auth/echo') {
          const body = await readBody(requestMessage);
          jsonCapture.resolve(body);
          responseMessage.writeHead(200, { 'content-type': 'application/json' });
          responseMessage.end(body);
          return;
        }

        responseMessage.writeHead(404).end();
      })().catch((error: unknown) => {
        responseMessage.destroy(error instanceof Error ? error : new Error(String(error)));
      });
    });
    await new Promise<void>((resolve) => upstream.listen(0, '127.0.0.1', resolve));
    upstreamUrl = `http://127.0.0.1:${(upstream.address() as AddressInfo).port}`;

    const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    Object.assign(process.env, {
      NODE_ENV: 'test',
      AUTH_SERVICE_URL: upstreamUrl,
      USER_SERVICE_URL: upstreamUrl,
      AI_SERVICE_URL: upstreamUrl,
      DB_HOST: '127.0.0.1',
      AUTH_DB_NAME: 'auth_test',
      AUTH_DB_USER: 'test',
      AUTH_DB_PASSWORD: 'test',
      USER_DB_NAME: 'users_test',
      USER_DB_USER: 'test',
      USER_DB_PASSWORD: 'test',
      REDIS_URL: 'redis://127.0.0.1:6379',
      JWT_PRIVATE_KEY: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
      JWT_PUBLIC_KEY: publicKey.export({ type: 'spki', format: 'pem' }).toString(),
      JWT_PRIVATE_KEY_PATH: '',
      JWT_PUBLIC_KEY_PATH: '',
      CORS_ORIGINS: 'http://127.0.0.1:3000',
      RATE_LIMIT_TTL_MS: '60000',
      RATE_LIMIT_MAX: '100',
      AI_RATE_LIMIT_MAX: '5',
      AI_RATE_LIMIT_WINDOW_MS: '60000',
    });

    const { AppModule } = await import('../src/app.module.js');
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(RedisThrottlerStorage)
      .useValue({ increment: storageIncrement })
      .compile();
    app = module.createNestApplication();
    configureGateway(app);
    await app.listen(0, '127.0.0.1');
    gatewayPort = (app.getHttpServer().address() as AddressInfo).port;
  });

  beforeEach(() => {
    storageHits.clear();
    storageIncrement.mockClear();
    multipartCapture = deferred();
    jsonCapture = deferred();
    releaseStream = deferred();
    upstreamAbort = deferred();
  });

  it('rejects unknown request fields with 400', async () => {
    await request(app.getHttpServer()).post('/health/echo').set('x-forwarded-for', '198.51.100.10').send({ value: 'ok', unexpected: true }).expect(400);
  });

  it('returns 429 after the route limit is exceeded', async () => {
    await request(app.getHttpServer()).post('/health/echo').set('x-forwarded-for', '198.51.100.11').send({ value: 'one' }).expect(201);
    await request(app.getHttpServer()).post('/health/echo').set('x-forwarded-for', '198.51.100.11').send({ value: 'two' }).expect(201);
    await request(app.getHttpServer()).post('/health/echo').set('x-forwarded-for', '198.51.100.11').send({ value: 'three' }).expect(429);
  });

  it('does not expose stack traces for 500 responses', async () => {
    const response = await request(app.getHttpServer()).get('/health/error').set('x-forwarded-for', '198.51.100.12').expect(500);
    expect(response.body).toMatchObject({ statusCode: 500, message: 'Internal server error' });
    expect(response.body).not.toHaveProperty('stack');
    expect(response.body.requestId).toEqual(expect.any(String));
  });

  it('forwards multipart bytes, boundary, and request ID unchanged and returns binary headers and bytes', async () => {
    const boundary = '----loccoc-task5-boundary';
    const body = Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="filterId"\r\n\r\nhandwritten-diary\r\n` +
      `--${boundary}\r\nContent-Disposition: form-data; name="image"; filename="sample.png"\r\n` +
      'Content-Type: image/png\r\n\r\n\u0000\u0001raw-image-bytes\r\n' +
      `--${boundary}--\r\n`,
      'binary',
    );

    const response = await request(app.getHttpServer())
      .post('/ai/enhance')
      .set('x-forwarded-for', '198.51.100.20')
      .set('content-type', `multipart/form-data; boundary=${boundary}`)
      .send(body)
      .buffer(true)
      .parse(binaryParser)
      .expect(200);
    const captured = await withTimeout(multipartCapture.promise, 'upstream did not receive multipart body');

    expect(captured.body).toEqual(body);
    expect(captured.contentType).toBe(`multipart/form-data; boundary=${boundary}`);
    expect(captured.requestId).toBe(response.headers['x-request-id']);
    expect(response.headers['content-type']).toMatch(/^image\/png/);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.headers['x-upstream-safe']).toBe('kept');
    expect(response.headers).not.toHaveProperty('x-upstream-hop');
    expect(response.body).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x01, 0x02, 0x03]));
  });

  it('streams the upstream image before the upstream response completes', async () => {
    const firstChunk = deferred<Buffer>();
    const completeResponse = deferred<Buffer>();
    const chunks: Buffer[] = [];
    const clientRequest = httpRequest({
      host: '127.0.0.1',
      port: gatewayPort,
      path: '/ai/stream',
      method: 'GET',
      headers: { 'x-forwarded-for': '198.51.100.21' },
    }, (responseMessage) => {
      responseMessage.on('data', (chunk: Buffer) => {
        chunks.push(Buffer.from(chunk));
        if (chunks.length === 1) firstChunk.resolve(Buffer.from(chunk));
      });
      responseMessage.on('end', () => completeResponse.resolve(Buffer.concat(chunks)));
      responseMessage.on('error', completeResponse.reject);
    });
    clientRequest.on('error', completeResponse.reject);
    clientRequest.end();

    await expect(withTimeout(firstChunk.promise, 'gateway buffered the upstream response')).resolves.toEqual(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d]),
    );
    releaseStream.resolve();
    await expect(withTimeout(completeResponse.promise, 'gateway stream did not finish')).resolves.toEqual(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x01, 0x02, 0x03]),
    );
  });

  it('aborts the upstream response when the client disconnects', async () => {
    const clientRequest = httpRequest({
      host: '127.0.0.1',
      port: gatewayPort,
      path: '/ai/abort',
      method: 'GET',
      headers: { 'x-forwarded-for': '198.51.100.22' },
    }, (responseMessage) => {
      responseMessage.once('data', () => responseMessage.destroy());
    });
    clientRequest.on('error', () => undefined);
    clientRequest.end();

    await expect(withTimeout(upstreamAbort.promise, 'gateway did not abort the upstream fetch')).resolves.toBeUndefined();
  });

  it('keeps existing JSON forwarding serialized exactly once', async () => {
    const payload = { email: 'person@example.com', nested: { enabled: true } };
    const response = await request(app.getHttpServer())
      .post('/auth/echo')
      .set('x-forwarded-for', '198.51.100.23')
      .send(payload)
      .expect(200);

    await expect(withTimeout(jsonCapture.promise, 'upstream did not receive JSON body')).resolves.toEqual(
      Buffer.from(JSON.stringify(payload)),
    );
    expect(response.body).toEqual(payload);
    expect(storageIncrement.mock.calls.filter((call) => call[4] === 'ai')).toHaveLength(0);
  });

  it('sanitizes an unavailable AI upstream response', async () => {
    const response = await request(app.getHttpServer())
      .get('/ai/failure')
      .set('x-forwarded-for', '198.51.100.24')
      .expect(502);

    expect(response.body).toMatchObject({
      statusCode: 502,
      error: 'Bad Gateway',
      message: 'Upstream service unavailable',
      requestId: expect.any(String),
    });
    expect(response.body).not.toHaveProperty('stack');
  });

  afterAll(async () => {
    await app.close();
    await new Promise<void>((resolve, reject) => upstream.close((error) => error ? reject(error) : resolve()));
  });
});
