import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { TypeOrmModule } from '@nestjs/typeorm';
import { validateEnvironment, JwtAuthGuard, JwtVerifier, RolesGuard } from '@loccoc/common';
import { DatabaseModule } from './database/database.module.js';
import { User } from './users/entities/user.entity.js';

const imports = [
  ConfigModule.forRoot({ isGlobal: true, envFilePath: ['.env', '../.env'], validate: validateEnvironment }),
  ...(process.env.NODE_ENV === 'test' ? [] : [DatabaseModule, TypeOrmModule.forFeature([User])]),
];

@Module({
  imports,
  providers: [
    JwtVerifier,
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}