import { Test } from '@nestjs/testing';
import { AppModule } from './app.module.js';

describe('AppModule', () => {
  it('compiles without application controllers', async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    expect(module.get(AppModule)).toBeInstanceOf(AppModule);
    await module.close();
  });
});
