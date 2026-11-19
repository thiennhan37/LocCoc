import type { MigrationInterface, QueryRunner } from 'typeorm';

export class EmailOtpJobs1794960000001 implements MigrationInterface {
  async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE TABLE email_otp_jobs (
      event_id uuid PRIMARY KEY, event jsonb NOT NULL, expires_at timestamptz NOT NULL,
      attempts integer NOT NULL DEFAULT 0, next_attempt_at timestamptz NOT NULL DEFAULT now(),
      finished_at timestamptz, result text, created_at timestamptz NOT NULL DEFAULT now()
    ); CREATE INDEX email_otp_jobs_pending ON email_otp_jobs(next_attempt_at) WHERE finished_at IS NULL;`);
  }
  async down(q: QueryRunner): Promise<void> { await q.query('DROP TABLE email_otp_jobs'); }
}
