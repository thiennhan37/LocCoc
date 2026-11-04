import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
  Optional,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { Kafka, Partitioners, type Producer, type SASLOptions } from 'kafkajs';
@Injectable()
export class SocialOutboxPublisher implements OnModuleInit, OnModuleDestroy {
  private producer?: Producer;
  private timer?: ReturnType<typeof setInterval>;
  private running?: Promise<void>;
  private cleanupTimer?: ReturnType<typeof setInterval>;
  private cleanupRunning?: Promise<void>;
  private cleanupBusy = false;
  private busy = false;
  private stopping = false;
  private readonly logger = new Logger(SocialOutboxPublisher.name);
  constructor(
    private readonly config: ConfigService,
    @Optional() private readonly db?: DataSource,
  ) {}
  onModuleInit() {
    if (this.config.get('NODE_ENV') === 'test') return;
    this.timer = setInterval(() => {
      if (!this.busy && !this.stopping)
        this.running = this.flush().catch(() => {
          this.logger.warn('Social outbox retry pending');
        });
    }, 2000);
    this.timer.unref();
    this.cleanupTimer = setInterval(
      () => {
        if (!this.cleanupBusy && !this.stopping)
          this.cleanupRunning = this.cleanup().catch(() => {
            this.logger.warn('Social outbox cleanup retry pending');
          });
      },
      5 * 60 * 1000,
    );
    this.cleanupTimer.unref();
  }
  async flush() {
    if (this.busy) return;
    this.busy = true;
    try {
      if (!this.producer) {
        const p = new Kafka({
          clientId: 'user-social-outbox',
          ssl: this.config.get('KAFKA_SSL') === 'true',
          ...(this.config.get('KAFKA_SASL_USERNAME')
            ? {
                sasl: {
                  mechanism: 'scram-sha-256',
                  username: this.config.getOrThrow<string>(
                    'KAFKA_SASL_USERNAME',
                  ),
                  password: this.config.getOrThrow<string>(
                    'KAFKA_SASL_PASSWORD',
                  ),
                } as SASLOptions,
              }
            : {}),
          brokers: this.config
            .get<string>('KAFKA_BROKERS', '127.0.0.1:9092')
            .split(','),
          requestTimeout: 10000,
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
      await this.db!.transaction(async (m) => {
        const rows: { id: string; aggregate_id: string; payload: object }[] =
          await m.query(
            'SELECT * FROM social_outbox WHERE published_at IS NULL ORDER BY created_at,id LIMIT 20 FOR UPDATE SKIP LOCKED',
          );
        if (!rows.length) return;
        await this.producer!.send({
          topic: this.config.get('SOCIAL_EVENTS_TOPIC', 'social.events'),
          messages: rows.map((e) => ({
            key: e.aggregate_id,
            value: JSON.stringify(e.payload),
          })),
        });
        await m.query(
          'UPDATE social_outbox SET published_at=now() WHERE id=ANY($1::uuid[])',
          [rows.map((e) => e.id)],
        );
      });
    } finally {
      this.busy = false;
    }
  }
  async cleanup(): Promise<void> {
    if (this.cleanupBusy) return;
    this.cleanupBusy = true;
    try {
      await this.db!.query(
        "DELETE FROM social_outbox WHERE id IN (SELECT id FROM social_outbox WHERE published_at < now()-interval '7 days' LIMIT 500)",
      );
    } finally {
      this.cleanupBusy = false;
    }
  }
  async onModuleDestroy() {
    this.stopping = true;
    if (this.timer) clearInterval(this.timer);
    if (this.cleanupTimer) clearInterval(this.cleanupTimer);
    await Promise.all([this.running, this.cleanupRunning]);
    await this.producer?.disconnect();
  }
}
