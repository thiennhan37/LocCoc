import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { validateEnvironment } from '@loccoc/common';

@Module({ imports: [ConfigModule.forRoot({ isGlobal: true, envFilePath: ['.env', '../.env'], validate: validateEnvironment })] })
export class AppModule {}

