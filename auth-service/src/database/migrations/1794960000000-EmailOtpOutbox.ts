import type { MigrationInterface, QueryRunner } from 'typeorm';

export class EmailOtpOutbox1794960000000 implements MigrationInterface {
  async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE TABLE auth_email_outbox (
      id uuid PRIMARY KEY, registration_id uuid NOT NULL, event jsonb NOT NULL,
      expires_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), published_at timestamptz
    ); CREATE INDEX auth_email_outbox_pending ON auth_email_outbox(created_at) WHERE published_at IS NULL;`);
  }
  async down(q: QueryRunner): Promise<void> { await q.query('DROP TABLE auth_email_outbox'); }
}
