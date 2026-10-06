import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { validateEnvironment } from '@loccoc/common';
import { DatabaseModule } from './database/database.module.js';

const imports = [
  ConfigModule.forRoot({ isGlobal: true, envFilePath: ['.env', '../.env'], validate: validateEnvironment }),
  ...(process.env.NODE_ENV === 'test' ? [] : [DatabaseModule]),
];

@Module({ imports })
export class AppModule {}