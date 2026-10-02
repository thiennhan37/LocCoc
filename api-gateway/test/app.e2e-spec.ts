import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { configureGateway } from '../src/bootstrap.js';

describe('IAM gateway security contract (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication();
    configureGateway(app);
    await app.init();
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

  afterAll(async () => app.close());
});
