import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { AccountAuthorityClient } from '@loccoc/common';
import { ChatDatabaseModule } from './database/database.module.js';
import { chatEnvPath, validateChatEnvironment } from './config.js';
import { ChatController } from './chat/chat.controller.js';
import { ChatGuard } from './chat/chat.guard.js';
import { ChatPolicy } from './chat/chat.policy.js';
import { ChatRepository } from './chat/chat.repository.js';
import { ChatService } from './chat/chat.service.js';
import { CHAT_EVENTS } from './chat/chat.types.js';
import { ChatSocketService } from './realtime/chat-socket.service.js';
import { HealthController } from './health.controller.js';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true, envFilePath: chatEnvPath, validate: validateChatEnvironment }), ChatDatabaseModule],
  controllers: [HealthController, ChatController],
  providers: [AccountAuthorityClient, ChatPolicy, ChatRepository, ChatService, ChatSocketService,
    { provide: CHAT_EVENTS, useExisting: ChatSocketService }, { provide: APP_GUARD, useClass: ChatGuard }],
})
export class AppModule {}
