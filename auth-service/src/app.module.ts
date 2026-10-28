import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { fileURLToPath } from 'node:url';
import { validateAuthEnvironment } from '@loccoc/common';
import { AuthModule } from './auth/auth.module.js';
import { DatabaseModule } from './database/database.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: fileURLToPath(new URL('../.env', import.meta.url)),
      validate: (input) => validateAuthEnvironment(input, fileURLToPath(new URL('..', import.meta.url))),
    }),
    DatabaseModule,
    AuthModule,
  ],
})
export class AppModule {}


