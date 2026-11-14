import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { Kafka, Partitioners, type Producer } from 'kafkajs';

@Injectable()
export class AccountEventsPublisher implements OnModuleInit, OnModuleDestroy {
  private producer?: Producer;
  private timer?: ReturnType<typeof setInterval>;
  private busy = false;
  private stopping = false;
  private running?: Promise<void>;
  private readonly logger = new Logger(AccountEventsPublisher.name);
  constructor(
    private readonly db: DataSource,
    private readonly config: ConfigService,
  ) {}
  onModuleInit(): void {
    if (this.config.get('NODE_ENV') === 'test') return;
    this.timer = setInterval(() => {
      if (this.busy || this.stopping) return;
      this.running = this.flush().catch(() =>
        this.logger.warn('Account events pending; broker unavailable'),
      );
    }, 2000);
    this.timer.unref();
  }
  async flush(): Promise<void> {
    if (this.busy || this.stopping) return;
    this.busy = true;
    try {
      if (!this.producer) {
        const p = new Kafka({
          clientId: 'auth-service',
          brokers: this.config
            .get<string>('KAFKA_BROKERS', '127.0.0.1:9092')
            .split(','),
          retry: { retries: 2 },
        }).producer({ createPartitioner: Partitioners.DefaultPartitioner });
        try {
          await p.connect();
          this.producer = p;
        } catch (e) {
          await p.disconnect();
          throw e;
        }
      }
      const events: {
        id: string;
        account_id: string;
        version: string;
        data: unknown;
        created_at: Date;
      }[] = await this.db.query(
        'SELECT * FROM account_events WHERE published_at IS NULL ORDER BY created_at,id LIMIT 100',
      );
      for (const e of events) {
        await this.producer.send({
          topic: this.config.get<string>(
            'ACCOUNT_EVENTS_TOPIC',
            'account.events',
          ),
          messages: [
            {
              key: e.account_id,
              value: JSON.stringify({
                eventId: e.id,
                eventType: 'ACCOUNT_CHANGED',
                aggregateId: e.account_id,
                version: Number(e.version),
                timestamp: e.created_at.toISOString(),
                data: e.data,
              }),
            },
          ],
        });
        await this.db.query(
          'UPDATE account_events SET published_at=now() WHERE id=$1',
          [e.id],
        );
      }
    } finally {
      this.busy = false;
    }
  }
  async onModuleDestroy(): Promise<void> {
    this.stopping = true;
    if (this.timer) clearInterval(this.timer);
    await this.running;
    await this.producer?.disconnect();
  }
}
