import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { fileURLToPath } from 'node:url';

function asBoolean(value: boolean | string): boolean {
  return value === true || value === 'true';
}

/**
 * Auth-service database connection.
 *
 * `synchronize` is deliberately disabled. Schema changes must be made through
 * the migrations in `src/database/migrations` so a production deploy cannot
 * accidentally alter or drop data.
 */
@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        return {
        type: 'postgres' as const,
        host: config.get<string>('DB_HOST', '127.0.0.1'),
        port: config.get<number>('DB_PORT', 5432),
        username: config.get<string>('AUTH_DB_USER', 'auth_service'),
        password: config.get<string>('AUTH_DB_PASSWORD', ''),
        database: config.get<string>('AUTH_DB_NAME', 'auth'),
        autoLoadEntities: true,
        synchronize: false,
        logging: config.get<string>('NODE_ENV', 'development') === 'development'
          && asBoolean(config.get<boolean | string>('TYPEORM_LOGGING', false)),
        migrationsRun: asBoolean(config.get<boolean | string>('TYPEORM_MIGRATIONS_RUN', false)),
        migrations: [fileURLToPath(new URL('./migrations/*.{js,ts}', import.meta.url))],
        retryAttempts: 3,
        retryDelay: 1000,
      };
      },
    }),
  ],
})
export class DatabaseModule {}






