import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Kafka, type Consumer } from 'kafkajs';
import { isUUID } from 'class-validator';
import type { AccountSnapshot } from '@loccoc/common';
import { SocialRepository } from './social.repository.js';

@Injectable()
export class AccountEventsConsumer implements OnModuleInit, OnModuleDestroy {
  private consumer?: Consumer;
  private timer?: ReturnType<typeof setInterval>;
  private busy = false;
  private stopping = false;
  private running?: Promise<void>;
  private readonly logger = new Logger(AccountEventsConsumer.name);
  constructor(
    private readonly repo: SocialRepository,
    private readonly config: ConfigService,
  ) {}
  async apply(event: unknown): Promise<void> {
    const e = event as {
      eventType?: string;
      aggregateId?: string;
      version?: number;
      data?: AccountSnapshot;
    } | null;
    const a = e?.data;
    if (
      e?.eventType !== 'ACCOUNT_CHANGED' ||
      !a ||
      !isUUID(a.id) ||
      e.aggregateId !== a.id ||
      !Number.isSafeInteger(a.version) ||
      a.version < 1 ||
      e.version !== a.version ||
      !['active', 'suspended', 'pending_verification', 'deleted'].includes(
        a.status,
      ) ||
      typeof a.email !== 'string' ||
      a.email.length > 320 ||
      (a.phone !== null && typeof a.phone !== 'string')
    ) {
      throw new Error('Invalid account event');
    }
    await this.repo.project(a);
  }
  onModuleInit(): void {
    if (this.config.get('NODE_ENV') === 'test') return;
    this.timer = setInterval(() => {
      if (this.busy || this.consumer || this.stopping) return;
      this.running = this.start().catch(() =>
        this.logger.warn('Account event consumer retry pending'),
      );
    }, 2000);
    this.timer.unref();
  }
  private async start(): Promise<void> {
    if (this.busy || this.consumer || this.stopping) return;
    this.busy = true;
    const consumer = new Kafka({
      clientId: 'user-service',
      brokers: this.config
        .get<string>('KAFKA_BROKERS', '127.0.0.1:9092')
        .split(','),
      retry: { retries: 2 },
    }).consumer({ groupId: 'user-service-accounts-v1' });
    try {
      await consumer.connect();
      await consumer.subscribe({
        topic: this.config.get<string>(
          'ACCOUNT_EVENTS_TOPIC',
          'account.events',
        ),
        fromBeginning: true,
      });
      await consumer.run({
        eachMessage: async ({ message }) => {
          await this.apply(JSON.parse(message.value?.toString() ?? 'null'));
        },
      });
      this.consumer = consumer;
    } catch (e) {
      await consumer.disconnect();
      throw e;
    } finally {
      this.busy = false;
    }
  }
  async onModuleDestroy(): Promise<void> {
    this.stopping = true;
    if (this.timer) clearInterval(this.timer);
    await this.running;
    await this.consumer?.disconnect();
  }
}
