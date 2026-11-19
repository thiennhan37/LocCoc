import { Injectable, Logger, ServiceUnavailableException, type OnModuleInit, type OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { Kafka, Partitioners, type Producer, type SASLOptions } from 'kafkajs';
import { EMAIL_OTP_TOPIC, encryptEmailOtp, otpSecret, type EmailOtpEvent } from '@loccoc/common';
import type { OtpSender, OtpDeliveryContext } from './otp.service.js';

@Injectable()
export class KafkaOtpSender implements OtpSender, OnModuleInit, OnModuleDestroy {
  private producer?: Producer;
  private timer?: ReturnType<typeof setInterval>;
  private running?: Promise<void>;
  private stopping = false;
  private readonly secret: string;
  private readonly logger = new Logger(KafkaOtpSender.name);
  constructor(private readonly db: DataSource, private readonly config: ConfigService) {
    this.secret = otpSecret(config);
  }
  async send(destination: string, code: string, channel: 'email' | 'phone', context?: OtpDeliveryContext): Promise<void> {
    if (channel !== 'email' || !context) throw new ServiceUnavailableException('Email OTP delivery is unavailable');
    const event = encryptEmailOtp({ email: destination, code, registrationId: context.registrationId, expiresAt: context.expiresAt }, this.secret);
    try {
      await this.db.query(`INSERT INTO auth_email_outbox(id,registration_id,event,expires_at) VALUES($1,$2,$3,$4)`,
        [event.eventId, event.aggregateId, event, event.expiresAt]);
    } catch {
      throw new ServiceUnavailableException('Email OTP could not be queued. Please try again later.');
    }
  }
  onModuleInit(): void {
    if (this.config.get('NODE_ENV') === 'test') return;
    this.timer = setInterval(() => {
      if (!this.running && !this.stopping) this.running = this.flush().catch(() => {
        this.logger.warn('Email OTP outbox pending; delivery will retry');
      }).finally(() => { this.running = undefined; });
    }, 1000);
    this.timer.unref();
  }
  async flush(): Promise<void> {
    // Row locks let multiple auth replicas publish safely; crash replay uses the same eventId.
    await this.db.transaction(async manager => {
      await manager.query('DELETE FROM auth_email_outbox WHERE expires_at <= now()');
      const events: { id: string; registration_id: string; event: EmailOtpEvent }[] = await manager.query(
        'SELECT * FROM auth_email_outbox WHERE published_at IS NULL AND expires_at>now() ORDER BY created_at,id LIMIT 25 FOR UPDATE SKIP LOCKED');
      if (!events.length) return;
      if (!this.producer) {
        const username = this.config.get<string>('KAFKA_SASL_USERNAME');
        const password = this.config.get<string>('KAFKA_SASL_PASSWORD');
        const producer = new Kafka({ clientId: 'auth-email-otp',
          brokers: this.config.get<string>('KAFKA_BROKERS', '127.0.0.1:9092').split(',').map(v => v.trim()),
          ssl: this.config.get('KAFKA_SSL') === 'true',
          ...(username && password ? { sasl: { mechanism: 'scram-sha-256', username, password } as SASLOptions } : {}),
          requestTimeout: 5000, retry: { retries: 2 },
        }).producer({ createPartitioner: Partitioners.DefaultPartitioner, idempotent: true });
        try { await producer.connect(); this.producer = producer; }
        catch (error) { await producer.disconnect(); throw error; }
      }
      for (const row of events) {
        if (Date.parse(row.event.expiresAt) <= Date.now()) continue;
        await this.producer.send({ topic: this.config.get('OTP_EVENTS_TOPIC', EMAIL_OTP_TOPIC), acks: -1,
          messages: [{ key: row.registration_id, value: JSON.stringify(row.event) }] });
        await manager.query('UPDATE auth_email_outbox SET published_at=now() WHERE id=$1', [row.id]);
      }
    });
  }
  async onModuleDestroy(): Promise<void> {
    this.stopping = true;
    if (this.timer) clearInterval(this.timer);
    await this.running;
    await this.producer?.disconnect();
  }
}
