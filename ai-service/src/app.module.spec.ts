import { Test } from '@nestjs/testing';

describe('AppModule', () => {
  beforeEach(() => {
    vi.stubEnv('GEMINI_API_KEY', 'test-gemini-key');
    vi.stubEnv('GEMINI_IMAGE_MODEL', 'gemini-3-pro-image-preview');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('exposes a liveness health controller without provider initialization', async () => {
    const { AppModule } = await import('./app.module.js');
    const { HealthController } = await import('./health.controller.js');
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();

    expect(module.get(HealthController).getHealth()).toEqual({ status: 'ok' });

    await module.close();
  });
});
