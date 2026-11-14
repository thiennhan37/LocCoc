import { DiscoveryService } from '../discovery/discovery.service.js';
import { DiscoveryRepository } from '../discovery/discovery.repository.js';
import { DiscoveryRuntime } from '../discovery/discovery.runtime.js';
import { GraphClient } from '../discovery/graph.client.js';
import { SocialOutboxPublisher } from './social-outbox.publisher.js';
import { Module } from '@nestjs/common';
import { AccountAuthorityClient } from '@loccoc/common';
import { SocialRepository } from './social.repository.js';
import { SocialService } from './social.service.js';
import { AccountEventsConsumer } from './account-events.consumer.js';

@Module({
  providers: [
    GraphClient,
    DiscoveryRepository,
    DiscoveryRuntime,
    DiscoveryService,
    SocialRepository,
    SocialService,
    AccountAuthorityClient,
    AccountEventsConsumer,
    SocialOutboxPublisher,
  ],
  exports: [
    SocialService,
    SocialRepository,
    AccountAuthorityClient,
    DiscoveryService,
  ],
})
export class SocialModule {}
