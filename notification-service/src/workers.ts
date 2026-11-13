import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { type Consumer } from 'kafkajs';
import {
  applicationDefault,
  initializeApp,
  type App,
} from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';
import { AccountAuthorityClient } from '@loccoc/common';
import { notificationKafka } from './kafka.js';
import { parseEvent } from './event.js';
import { NotificationsRepository } from './notifications.repository.js';
@Injectable()
export class NotificationWorkers implements OnModuleInit, OnModuleDestroy {
  private timer?: ReturnType<typeof setInterval>;
  private consumer?: Consumer;
  private firebase?: App;
  private busy = false;
  private starting = false;
  private stopping = false;
  private running?: Promise<void>;
  private connecting?: Promise<void>;
  private ticks = 0;
  private readonly logger = new Logger(NotificationWorkers.name);
  constructor(
    private readonly db: DataSource,
    private readonly config: ConfigService,
    private readonly repo: NotificationsRepository,
    private readonly authority: AccountAuthorityClient,
  ) {}
  onModuleInit() {
    if (this.config.get('NODE_ENV') === 'test') return;
    if (this.config.get('FCM_ENABLED') === 'true')
      this.firebase = initializeApp(
        { credential: applicationDefault() },
        'loccoc-notifications',
      );
    this.timer = setInterval(() => {
      if (!this.consumer && !this.starting && !this.stopping)
        this.connecting = this.start().catch(() => {
          this.logger.warn('Notification consumer retry pending');
        });
      if (!this.busy && !this.stopping)
        this.running = this.tick().catch(() => {
          this.logger.warn('Notification jobs retry pending');
        });
    }, 2000);
    this.timer.unref();
  }
  async start() {
    if (this.starting || this.consumer || this.stopping) return;
    this.starting = true;
    const consumer = notificationKafka(
      this.config,
      'notification-service',
    ).consumer({
      groupId: this.config.get(
        'NOTIFICATION_CONSUMER_GROUP',
        'notification-social-v1',
      ),
    });
    try {
      await consumer.connect();
      await consumer.subscribe({
        topic: this.config.get('SOCIAL_EVENTS_TOPIC', 'social.events'),
        fromBeginning: true,
      });
      consumer.on(consumer.events.CRASH, () => {
        if (this.consumer === consumer) {
          this.consumer = undefined;
          void consumer.disconnect().catch(() => {});
        }
      });
      await consumer.run({
        eachMessage: async ({ topic, partition, message }) => {
          let event;
          try {
            if (!message.value || message.value.length > 32768) throw Error();
            event = parseEvent(JSON.parse(message.value.toString()));
          } catch {
            await this.db.query(
              `INSERT INTO notification_quarantine(topic,partition,offset_id,reason) VALUES($1,$2,$3,'Invalid event payload') ON CONFLICT DO NOTHING`,
              [topic, partition, message.offset],
            );
            this.logger.warn('Notification event quarantined');
            return;
          }
          await this.repo.ingest(event);
        },
      });
      this.consumer = consumer;
    } catch (e) {
      await consumer.disconnect();
      throw e;
    } finally {
      this.starting = false;
    }
  }
  async tick() {
    if (this.busy) return;
    this.busy = true;
    try {
      if (this.firebase) await this.deliver();
      await this.db.query(
        `UPDATE push_jobs SET finished_at=now() WHERE finished_at IS NULL AND expires_at<=now()`,
      );
      if (++this.ticks % 30 === 0) await this.repo.cleanup();
    } finally {
      this.busy = false;
    }
  }
  async deliver() {
    await this.db.transaction(async (m) => {
      const jobs =
        await m.query(`SELECT j.*,d.token,n.recipient_id,n.type,n.actor,n.data FROM push_jobs j
 JOIN notifications n ON n.id=j.notification_id LEFT JOIN push_devices d ON d.installation_id=j.installation_id
 AND d.session_id=j.session_id AND d.recipient_id=n.recipient_id AND d.token_hash=j.token_hash
 WHERE j.finished_at IS NULL AND j.next_attempt_at<=now() AND j.expires_at>now()
 ORDER BY j.next_attempt_at,j.id LIMIT 5 FOR UPDATE OF j SKIP LOCKED`);
      for (const j of jobs) {
        try {
          const [device] = await m.query(
            'SELECT token FROM push_devices WHERE installation_id=$1 AND session_id=$2 AND token_hash=$3 AND recipient_id=$4 FOR UPDATE',
            [j.installation_id, j.session_id, j.token_hash, j.recipient_id],
          );
          j.token = device?.token;
          if (!j.token) {
            await m.query(
              'UPDATE push_jobs SET finished_at=now() WHERE id=$1',
              [j.id],
            );
            continue;
          }
          const access = await this.authority.call<{ allowed: boolean }>(
            `push-sessions/${j.recipient_id}/${j.session_id}`,
            '',
          );
          if (!access.allowed) {
            await m.query(
              'DELETE FROM push_devices WHERE installation_id=$1 AND session_id=$2 AND token_hash=$3',
              [j.installation_id, j.session_id, j.token_hash],
            );
            await m.query(
              'UPDATE push_jobs SET finished_at=now() WHERE id=$1',
              [j.id],
            );
            continue;
          }
          const expiration = Math.floor(
              new Date(j.expires_at).getTime() / 1000,
            ),
            ttl = Math.max(0, expiration * 1000 - Date.now());
          if (ttl <= 0) continue;
          const name = j.actor.displayName || 'Một người dùng';
          await getMessaging(this.firebase).send({
            token: j.token,
            notification: {
              title: 'LocCoc',
              body:
                j.type === 'FRIEND_REQUEST_RECEIVED'
                  ? `${name} đã gửi lời mời kết bạn.`
                  : `${name} đã chấp nhận lời mời kết bạn.`,
            },
            data: {
              notificationId: j.notification_id,
              recipientId: j.recipient_id,
              type: j.type,
              actorId: j.actor.id,
              friendRequestId: j.data.friendRequestId,
            },
            android: { ttl, notification: { tag: j.notification_id } },
            apns: {
              headers: {
                'apns-expiration': String(expiration),
                'apns-collapse-id': j.notification_id,
              },
              payload: { aps: { sound: 'default' } },
            },
          });
          await m.query(
            'UPDATE push_jobs SET finished_at=now(),attempts=attempts+1 WHERE id=$1',
            [j.id],
          );
        } catch (e) {
          const code = (e as { code?: string }).code;
          if (
            code === 'messaging/registration-token-not-registered' ||
            code === 'messaging/invalid-registration-token'
          ) {
            await m.query(
              'DELETE FROM push_devices WHERE installation_id=$1 AND session_id=$2 AND token_hash=$3',
              [j.installation_id, j.session_id, j.token_hash],
            );
            await m.query(
              'UPDATE push_jobs SET finished_at=now() WHERE id=$1',
              [j.id],
            );
          } else {
            await m.query(
              `UPDATE push_jobs SET attempts=attempts+1,next_attempt_at=now()+make_interval(secs=>LEAST(3600,POWER(2,LEAST(attempts+1,12)))::integer),finished_at=CASE WHEN attempts>=11 THEN now() ELSE NULL END WHERE id=$1`,
              [j.id],
            );
            this.logger.warn('Push delivery retry scheduled');
          }
        }
      }
    });
  }
  async onModuleDestroy() {
    this.stopping = true;
    if (this.timer) clearInterval(this.timer);
    await this.connecting;
    await this.running;
    await this.consumer?.disconnect();
  }
}
