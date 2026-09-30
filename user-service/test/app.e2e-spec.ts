import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module.js';

describe('Empty application (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  it('starts without exposing application APIs', async () => {
    await request(app.getHttpServer()).get('/').expect(404);
    await request(app.getHttpServer()).get('/oauth/callback').expect(404);
    await request(app.getHttpServer()).get('/.well-known/assetlinks.json').expect(404);
  });

  afterEach(async () => {
    await app.close();
  });
});
