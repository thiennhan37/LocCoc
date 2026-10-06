import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule, type TypeOrmModuleOptions } from '@nestjs/typeorm';
import { fileURLToPath } from 'node:url';

function asBoolean(value: boolean | string): boolean {
  return value === true || value === 'true';
}

export function createAuthDatabaseOptions(config: ConfigService): TypeOrmModuleOptions {
  return {
    type: 'postgres',
    host: config.get<string>('DB_HOST', '127.0.0.1'),
    port: config.get<number>('DB_PORT', 5433),
    username: config.get<string>('AUTH_DB_USER', 'auth_service'),
    password: config.get<string>('AUTH_DB_PASSWORD', ''),
    database: config.get<string>('AUTH_DB_NAME', 'accounts'),
    autoLoadEntities: true,
    synchronize: false,
    logging: config.get<string>('NODE_ENV', 'development') === 'development'
      && asBoolean(config.get<boolean | string>('TYPEORM_LOGGING', false)),
    migrationsRun: asBoolean(config.get<boolean | string>('TYPEORM_MIGRATIONS_RUN', false)),
    migrations: [fileURLToPath(new URL('./migrations/*.{js,ts}', import.meta.url))],
    retryAttempts: 3,
    retryDelay: 1000,
  };
}

/** Auth-service owns the accounts database. */
@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: createAuthDatabaseOptions,
    }),
  ],
})
export class DatabaseModule {}