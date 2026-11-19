import { Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { decryptEmailOtp, type EmailOtpEvent } from '@loccoc/common';
import { BrevoEmailSender, EmailDeliveryError } from './brevo-email.sender.js';

@Injectable()
export class EmailOtpRepository {
  private readonly logger = new Logger(EmailOtpRepository.name);
  constructor(private readonly db: DataSource, private readonly sender: BrevoEmailSender) {}
  async ingest(event: EmailOtpEvent): Promise<void> {
    if (Date.parse(event.expiresAt) <= Date.now()) return;
    await this.db.query(`INSERT INTO email_otp_jobs(event_id,event,expires_at) VALUES($1,$2,$3) ON CONFLICT(event_id) DO NOTHING`,
      [event.eventId, event, event.expiresAt]);
  }
  async quarantine(topic: string, partition: number, offset: string): Promise<void> {
    await this.db.query(`INSERT INTO notification_quarantine(topic,partition,offset_id,reason)
      VALUES($1,$2,$3,'Invalid email OTP event') ON CONFLICT DO NOTHING`, [topic, partition, offset]);
  }
  async deliver(secret: string): Promise<void> {
    await this.db.transaction(async manager => {
      const jobs: { event_id: string; event: EmailOtpEvent; attempts: number }[] = await manager.query(
        `SELECT * FROM email_otp_jobs WHERE finished_at IS NULL AND next_attempt_at<=now() AND expires_at>now()
         ORDER BY next_attempt_at,event_id LIMIT 5 FOR UPDATE SKIP LOCKED`);
      for (const job of jobs) {
        let payload;
        try { payload = decryptEmailOtp(job.event, secret); }
        catch {
          await manager.query("UPDATE email_otp_jobs SET finished_at=now(),result='invalid' WHERE event_id=$1", [job.event_id]);
          this.logger.warn('Email OTP job rejected; invalid encrypted payload');
          continue;
        }
        if (Date.parse(payload.expiresAt) <= Date.now()) continue;
        try {
          await this.sender.send(payload, job.event_id);
          await manager.query("UPDATE email_otp_jobs SET finished_at=now(),result='sent',attempts=attempts+1 WHERE event_id=$1", [job.event_id]);
        } catch (error) {
          const retry = !(error instanceof EmailDeliveryError) || error.retryable;
          const delay = Math.min(300, Math.max(Math.min(60, 2 ** Math.min(job.attempts + 1, 6)), error instanceof EmailDeliveryError ? error.retryAfterSeconds : 5));
          await manager.query(`UPDATE email_otp_jobs SET attempts=attempts+1,next_attempt_at=now()+make_interval(secs=>$2),
            finished_at=CASE WHEN $3 THEN NULL ELSE now() END,result=CASE WHEN $3 THEN 'retry' ELSE 'rejected' END WHERE event_id=$1`,
          [job.event_id, delay, retry]);
          this.logger.warn(retry ? 'Email OTP delivery retry scheduled' : 'Email OTP delivery rejected');
        }
      }
      // Ciphertexts are short-lived; quarantine retains metadata only, never the OTP.
      await manager.query('DELETE FROM email_otp_jobs WHERE expires_at<=now()');
    });
  }
}
