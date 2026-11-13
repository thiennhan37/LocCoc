import { ConfigService } from '@nestjs/config';
import { describe, expect, it } from 'vitest';
import { createUserDatabaseOptions, createUserMigrationOptions, USER_MIGRATIONS } from './database.module.js';

describe('User database bootstrap', () => {
  it.each([false, 'false'])('runs explicit migrations when the startup flag is %s without schema sync', (flag) => {
    const config = new ConfigService({ TYPEORM_MIGRATIONS_RUN: flag });
    expect(createUserDatabaseOptions(config).migrationsRun).toBe(false);
    const options = createUserMigrationOptions(config);
    expect(options.migrationsRun).toBe(true);
    expect(options.synchronize).toBe(false);
    expect(options.logging).toBe(false);
    expect(options.migrations).toEqual(USER_MIGRATIONS);
  });
});
