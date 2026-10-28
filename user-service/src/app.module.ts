import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD, Reflector } from '@nestjs/core';
import { fileURLToPath } from 'node:url';
import { validateUserEnvironment, JwtAuthGuard, JwtVerifier, RolesGuard, OwnershipGuard } from '@loccoc/common';
import { DatabaseModule } from './database/database.module.js';
import { RedisModule } from './redis/redis.module.js';
import { UsersModule } from './users/users.module.js';

const imports = [
  ConfigModule.forRoot({
    isGlobal: true,
    envFilePath: fileURLToPath(new URL('../.env', import.meta.url)),
    validate: (input) => validateUserEnvironment(input, fileURLToPath(new URL('..', import.meta.url))),
  }),
  ...(process.env.NODE_ENV === 'test' ? [] : [DatabaseModule]),
  RedisModule,
  UsersModule,
];

@Module({
  imports,
  providers: [
    Reflector,
    JwtVerifier,
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_GUARD, useClass: OwnershipGuard },
  ],
})
export class AppModule {}
