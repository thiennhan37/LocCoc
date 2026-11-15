import { ProfileMedia1794528000000 } from './migrations/1794528000000-ProfileMedia.js';
import { DiscoveryRefreshLeases1794441600000 } from './migrations/1794441600000-DiscoveryRefreshLeases.js';
import { SocialOutbox1793318400000 } from './migrations/1793318400000-SocialOutbox.js';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule, type TypeOrmModuleOptions } from '@nestjs/typeorm';
import { CreateUsersTable1710000000000 } from './migrations/1710000000000-CreateUsersTable.js';
import { UserSocial1793145600000 } from './migrations/1793145600000-UserSocial.js';
import { DisplayNameCooldown1794268800000 } from './migrations/1794268800000-DisplayNameCooldown.js';
import { SmartDiscovery1794355200000 } from './migrations/1794355200000-SmartDiscovery.js';

function asBoolean(
  value: boolean | string | undefined,
  defaultValue = false,
): boolean {
  if (value === undefined || value === null) return defaultValue;
  return value === true || value === 'true';
}

export const USER_MIGRATIONS = [
  CreateUsersTable1710000000000,
  UserSocial1793145600000,
  SocialOutbox1793318400000,
  DisplayNameCooldown1794268800000,
  SmartDiscovery1794355200000,
  DiscoveryRefreshLeases1794441600000,
  ProfileMedia1794528000000,
];

export function createUserDatabaseOptions(
  config: ConfigService,
): TypeOrmModuleOptions {
  return {
    type: 'postgres',
    host: config.get<string>('DB_HOST', '127.0.0.1'),
    port: config.get<number>('DB_PORT', 5433),
    username: config.get<string>('USER_DB_USER', 'user_service'),
    password: config.get<string>('USER_DB_PASSWORD', ''),
    database: config.get<string>('USER_DB_NAME', 'users'),
    autoLoadEntities: true,
    synchronize: false,
    migrations: USER_MIGRATIONS,
    migrationsRun: asBoolean(
      config.get<boolean | string>('TYPEORM_MIGRATIONS_RUN'),
      true,
    ),
    logging:
      config.get<string>('NODE_ENV', 'development') === 'development' &&
      asBoolean(config.get<boolean | string>('TYPEORM_LOGGING', false)),
    retryAttempts: 3,
    retryDelay: 1000,
  };
}

/** Explicit bootstrap command, independent of the normal startup flag. */
export function createUserMigrationOptions(config: ConfigService): TypeOrmModuleOptions {
  return { ...createUserDatabaseOptions(config), migrationsRun: true, synchronize: false, logging: false };
}

/** Business-data connection. Domain tables will be added in later changes. */
@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: createUserDatabaseOptions,
    }),
  ],
})
export class DatabaseModule {}
