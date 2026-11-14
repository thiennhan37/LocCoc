import { ConfigService } from '@nestjs/config';
import { describe, expect, it } from 'vitest';
import { createAuthDatabaseOptions, createAuthMigrationOptions, AUTH_MIGRATIONS } from './database.module.js';

describe('Auth database bootstrap', () => {
  it.each([false, 'false'])('runs explicit migrations when the startup flag is %s without schema sync', (flag) => {
    const config = new ConfigService({ TYPEORM_MIGRATIONS_RUN: flag });
    expect(createAuthDatabaseOptions(config).migrationsRun).toBe(false);
    const options = createAuthMigrationOptions(config);
    expect(options.migrationsRun).toBe(true);
    expect(options.synchronize).toBe(false);
    expect(options.logging).toBe(false);
    expect(options.migrations).toEqual(AUTH_MIGRATIONS);
  });
});
