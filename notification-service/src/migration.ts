import type { MigrationInterface, QueryRunner } from 'typeorm';
export class Notifications1793318400001 implements MigrationInterface {
  async up(q: QueryRunner): Promise<void> {
    await q.query(`
 CREATE TABLE inbox_state(recipient_id uuid PRIMARY KEY,latest_sequence bigint NOT NULL DEFAULT 0,
 last_seen_sequence bigint NOT NULL DEFAULT 0,last_seen_at timestamptz,
 CHECK(last_seen_sequence>=0 AND last_seen_sequence<=latest_sequence));
 CREATE TABLE notification_dedupe(event_id uuid NOT NULL,recipient_id uuid NOT NULL,type text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(event_id,recipient_id,type));
 CREATE TABLE notifications(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),event_id uuid NOT NULL,
 recipient_id uuid NOT NULL, inbox_sequence bigint NOT NULL,type text NOT NULL,actor jsonb NOT NULL,
 data jsonb NOT NULL,occurred_at timestamptz NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 expires_at timestamptz NOT NULL DEFAULT (clock_timestamp()+interval '90 days'),read_at timestamptz,
 UNIQUE(event_id,recipient_id,type),UNIQUE(recipient_id,inbox_sequence));
 CREATE INDEX notification_list ON notifications(recipient_id,created_at DESC,id DESC);
 CREATE INDEX notification_unread ON notifications(recipient_id,inbox_sequence) WHERE read_at IS NULL;
 CREATE INDEX notification_expiry ON notifications(expires_at);
 CREATE TABLE push_devices(installation_id uuid PRIMARY KEY,recipient_id uuid NOT NULL,session_id uuid NOT NULL,
 token text NOT NULL UNIQUE,token_hash text NOT NULL,platform text NOT NULL CHECK(platform IN ('android','ios')),updated_at timestamptz NOT NULL DEFAULT now());
 CREATE TABLE push_jobs(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),notification_id uuid NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
 installation_id uuid NOT NULL,session_id uuid NOT NULL,token_hash text NOT NULL,
 expires_at timestamptz NOT NULL,attempts integer NOT NULL DEFAULT 0,next_attempt_at timestamptz NOT NULL DEFAULT now(),
 finished_at timestamptz,UNIQUE(notification_id,installation_id));
 CREATE INDEX push_pending ON push_jobs(next_attempt_at) WHERE finished_at IS NULL;
 CREATE TABLE notification_quarantine(topic text NOT NULL,partition integer NOT NULL,offset_id text NOT NULL,
 reason text NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(topic,partition,offset_id));
 `);
  }
  async down(q: QueryRunner): Promise<void> {
    await q.query(
      'DROP TABLE notification_quarantine,push_jobs,push_devices,notifications,notification_dedupe,inbox_state',
    );
  }
}
