import { Injectable, Logger, type OnModuleInit, type OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Consumer } from 'kafkajs';
import { EMAIL_OTP_TOPIC, parseEmailOtpEvent, otpSecret, decryptEmailOtp } from '@loccoc/common';
import { notificationKafka } from './kafka.js';
import { EmailOtpRepository } from './email-otp.repository.js';

@Injectable()
export class EmailOtpWorker implements OnModuleInit, OnModuleDestroy {
  private consumer?: Consumer;
  private timer?: ReturnType<typeof setInterval>;
  private connecting?: Promise<void>;
  private delivering?: Promise<void>;
  private stopping = false;
  private readonly logger = new Logger(EmailOtpWorker.name);
  constructor(private readonly config: ConfigService, private readonly repo: EmailOtpRepository) {}
  onModuleInit(): void {
    if (this.config.get('NODE_ENV') === 'test') return;
    const enabled = this.config.get('EMAIL_OTP_ENABLED');
    if (enabled === 'false' || (enabled !== 'true' && !this.config.get('BREVO_MAIL_API_KEY'))) return;
    const secret = otpSecret(this.config);
    this.timer = setInterval(() => {
      if (this.stopping) return;
      if (!this.consumer && !this.connecting) this.connecting = this.start(secret).catch(() => {
        this.logger.warn('Email OTP Kafka consumer retry pending');
      }).finally(() => { this.connecting = undefined; });
      if (!this.delivering) this.delivering = this.repo.deliver(secret).catch(() => {
        this.logger.warn('Email OTP jobs pending; delivery will retry');
      }).finally(() => { this.delivering = undefined; });
    }, 1000);
    this.timer.unref();
  }
  async start(secret = otpSecret(this.config)): Promise<void> {
    const consumer = notificationKafka(this.config, 'notification-email-otp').consumer({
      groupId: this.config.get('OTP_CONSUMER_GROUP', 'notification-email-otp-v1'),
    });
    try {
      await consumer.connect();
      await consumer.subscribe({ topic: this.config.get('OTP_EVENTS_TOPIC', EMAIL_OTP_TOPIC), fromBeginning: true });
      consumer.on(consumer.events.CRASH, () => {
        if (this.consumer === consumer) { this.consumer = undefined; void consumer.disconnect().catch(() => {}); }
      });
      await consumer.run({ eachMessage: async ({ topic, partition, message }) => {
        let event;
        try {
          if (!message.value || message.value.length > 8192) throw new Error();
          event = parseEmailOtpEvent(JSON.parse(message.value.toString()));
          // Authenticate the envelope before acknowledging its offset.
          decryptEmailOtp(event, secret);
        } catch {
          await this.repo.quarantine(topic, partition, message.offset);
          this.logger.warn('Invalid email OTP event quarantined');
          return;
        }
        await this.repo.ingest(event);
      } });
      this.consumer = consumer;
    } catch (error) { await consumer.disconnect(); throw error; }
  }
  async onModuleDestroy(): Promise<void> {
    this.stopping = true;
    if (this.timer) clearInterval(this.timer);
    await this.connecting;
    await this.consumer?.disconnect();
    await this.delivering;
  }
}
