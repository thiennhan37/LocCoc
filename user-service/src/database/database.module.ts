import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule, type TypeOrmModuleOptions } from '@nestjs/typeorm';

export function createUserDatabaseOptions(config: ConfigService): TypeOrmModuleOptions {
  const logging = config.get<boolean | string>('TYPEORM_LOGGING', false);
  return {
    type: 'postgres',
    host: config.get<string>('DB_HOST', '127.0.0.1'),
    port: config.get<number>('DB_PORT', 5433),
    username: config.get<string>('USER_DB_USER', 'user_service'),
    password: config.get<string>('USER_DB_PASSWORD', ''),
    database: config.get<string>('USER_DB_NAME', 'users'),
    autoLoadEntities: true,
    synchronize: false,
    migrations: [],
    migrationsRun: false,
    logging: config.get<string>('NODE_ENV', 'development') === 'development'
      && (logging === true || logging === 'true'),
    retryAttempts: 3,
    retryDelay: 1000,
  };
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