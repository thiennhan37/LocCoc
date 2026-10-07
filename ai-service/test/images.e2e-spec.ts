import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { IMAGE_PROVIDER, ImageProvider } from '../src/images/image-provider.js';
import { ApiExceptionFilter, requestIdMiddleware } from '@loccoc/common';
import { ImageEnhancementError } from '../src/images/image-enhancement.error.js';
import type { ValidatedImage, GeneratedImage, FilterPrompt } from '../src/images/image.types.js';

const VALID_PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
const VALID_PNG_BUFFER = Buffer.from(VALID_PNG_BASE64, 'base64');

describe('ImageEnhancementController (e2e)', () => {
  let app: INestApplication;
  let providerMock: vi.Mock;

  beforeEach(async () => {
    providerMock = vi.fn().mockResolvedValue({ bytes: VALID_PNG_BUFFER, mimeType: 'image/png' });

    const fakeProvider: ImageProvider = {
      enhance: providerMock,
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(IMAGE_PROVIDER)
      .useValue(fakeProvider)
      .compile();

    app = moduleFixture.createNestApplication();
    app.use(requestIdMiddleware);
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    app.useGlobalFilters(new ApiExceptionFilter());
    
    await app.init();
  });

  afterEach(async () => {
    await app.close();
    vi.unstubAllEnvs();
  });

  it('handles valid multipart binary output and headers', async () => {
    const res = await request(app.getHttpServer())
      .post('/ai/images/enhance')
      .attach('image', VALID_PNG_BUFFER, { filename: 'test.png', contentType: 'image/png' })
      .field('filterId', 'handwritten_diary');

    expect(res.status).toBe(200);
    expect(res.header['cache-control']).toBe('no-store');
    expect(res.header['x-request-id']).toBeDefined();
    expect(res.header['content-type']).toBe('image/png');
    expect(res.body).toEqual(VALID_PNG_BUFFER);
  });

  it('rejects missing image', async () => {
    const res = await request(app.getHttpServer())
      .post('/ai/images/enhance')
      .field('filterId', 'handwritten_diary');

    expect(res.status).toBe(400);
    expect(res.body.requestId).toBeDefined();
    expect(res.body.message).toContain('image');
    expect(res.header['cache-control']).toBe('no-store');
  });

  it('rejects missing filter', async () => {
    const res = await request(app.getHttpServer())
      .post('/ai/images/enhance')
      .attach('image', VALID_PNG_BUFFER, { filename: 'test.png', contentType: 'image/png' });

    expect(res.status).toBe(400);
    expect(res.body.message).toEqual(expect.arrayContaining([expect.stringContaining('filterId')]));
    expect(res.header['cache-control']).toBe('no-store');
  });

  it('rejects unknown filter', async () => {
    const res = await request(app.getHttpServer())
      .post('/ai/images/enhance')
      .attach('image', VALID_PNG_BUFFER, 'test.png')
      .field('filterId', 'invalid_filter');

    expect(res.status).toBe(400);
    expect(res.body.message).toEqual(expect.arrayContaining([expect.stringContaining('filterId')]));
  });

  it('rejects extra text fields (like prompt)', async () => {
    const res = await request(app.getHttpServer())
      .post('/ai/images/enhance')
      .attach('image', VALID_PNG_BUFFER, 'test.png')
      .field('filterId', 'handwritten_diary')
      .field('prompt', 'do something else');

    expect(res.status).toBe(400);
    expect(res.body.message).toEqual(expect.arrayContaining([expect.stringContaining('prompt')]));
  });
  
  it('rejects extra file fields', async () => {
    const res = await request(app.getHttpServer())
      .post('/ai/images/enhance')
      .attach('image', VALID_PNG_BUFFER, 'test.png')
      .attach('extraFile', Buffer.from('test'), 'test.txt')
      .field('filterId', 'handwritten_diary');

    expect(res.status).toBe(400);
  });

  it('rejects 10 MiB overflow', async () => {
    // 10 MiB + 1 byte
    const largeBuffer = Buffer.alloc(10 * 1024 * 1024 + 1, 'A');
    const res = await request(app.getHttpServer())
      .post('/ai/images/enhance')
      .attach('image', largeBuffer, 'test.png')
      .field('filterId', 'handwritten_diary');

    expect(res.status).toBe(413);
    expect(res.body.message).toBeDefined();
    expect(res.body.error).toBe('PAYLOAD_TOO_LARGE');
  });

  it('rejects invalid signature (fake png)', async () => {
    const fakePng = Buffer.from('not a real png data...');
    const res = await request(app.getHttpServer())
      .post('/ai/images/enhance')
      .attach('image', fakePng, { filename: 'test.png', contentType: 'image/png' })
      .field('filterId', 'handwritten_diary');

    expect(res.status).toBe(415);
    expect(res.body.message).toBe('Only JPEG, PNG, and WebP images are supported');
  });

  it('rejects timeout', async () => {
    // We can simulate timeout by throwing the appropriate ImageEnhancementError from the provider, 
    // since the service already tested that it produces a 504 when the deadline expires.
    providerMock.mockRejectedValue(new ImageEnhancementError('TIMEOUT', 'Timeout'));
    const res = await request(app.getHttpServer())
      .post('/ai/images/enhance')
      .attach('image', VALID_PNG_BUFFER, 'test.png')
      .field('filterId', 'handwritten_diary');

    expect(res.status).toBe(504);
    expect(res.body.message).toBe('Timeout');
  });

  it('rejects provider failure', async () => {
    providerMock.mockRejectedValue(new ImageEnhancementError('PROVIDER_FAILURE', 'Provider failed to process the request'));
    const res = await request(app.getHttpServer())
      .post('/ai/images/enhance')
      .attach('image', VALID_PNG_BUFFER, 'test.png')
      .field('filterId', 'handwritten_diary');

    expect(res.status).toBe(502);
    expect(res.body.message).toBe('Provider failed to process the request');
  });

  it('rejects invalid sticker output', async () => {
    providerMock.mockRejectedValue(new ImageEnhancementError('INVALID_AI_OUTPUT', 'AI did not return a valid image'));
    const res = await request(app.getHttpServer())
      .post('/ai/images/enhance')
      .attach('image', VALID_PNG_BUFFER, 'test.png')
      .field('filterId', 'subject_sticker');

    expect(res.status).toBe(422);
    expect(res.body.message).toBe('AI did not return a valid image');
  });
});
