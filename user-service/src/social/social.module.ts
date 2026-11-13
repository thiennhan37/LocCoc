import { SocialOutboxPublisher } from './social-outbox.publisher.js';
import { Module } from '@nestjs/common';
import { AccountAuthorityClient } from '@loccoc/common';
import { SocialRepository } from './social.repository.js';
import { SocialService } from './social.service.js';
import { AccountEventsConsumer } from './account-events.consumer.js';

@Module({
  providers: [
    SocialRepository,
    SocialService,
    AccountAuthorityClient,
    AccountEventsConsumer,
    SocialOutboxPublisher,
  ],
  exports: [SocialService, SocialRepository, AccountAuthorityClient],
})
export class SocialModule {}
