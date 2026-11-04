import type { MigrationInterface, QueryRunner } from 'typeorm';

export class LoginHistory1793577600000 implements MigrationInterface {
  async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE TABLE login_history (
      session_id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      device_info jsonb, ip inet, created_at timestamptz NOT NULL,
      last_used_at timestamptz NOT NULL, expires_at timestamptz NOT NULL, revoked_at timestamptz
    );
    CREATE INDEX idx_login_history_owner_time ON login_history(user_id,created_at DESC,session_id DESC);
    CREATE INDEX idx_login_history_created_at ON login_history(created_at);
    CREATE FUNCTION capture_login_history() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      INSERT INTO login_history(session_id,user_id,device_info,ip,created_at,last_used_at,expires_at,revoked_at)
      VALUES(NEW.id,NEW.user_id,NEW.device_info,NEW.ip,NEW.created_at,NEW.last_used_at,NEW.expires_at,NEW.revoked_at)
      ON CONFLICT(session_id) DO UPDATE SET device_info=EXCLUDED.device_info,ip=EXCLUDED.ip,
        last_used_at=EXCLUDED.last_used_at,expires_at=EXCLUDED.expires_at,
        revoked_at=COALESCE(login_history.revoked_at,EXCLUDED.revoked_at);
      RETURN NEW;
    END $$;
    CREATE TRIGGER sessions_login_history AFTER INSERT OR UPDATE ON sessions
      FOR EACH ROW EXECUTE FUNCTION capture_login_history();
    INSERT INTO login_history(session_id,user_id,device_info,ip,created_at,last_used_at,expires_at,revoked_at)
      SELECT id,user_id,device_info,ip,created_at,last_used_at,expires_at,revoked_at FROM sessions
      WHERE created_at>now()-interval '90 days' OR (revoked_at IS NULL AND expires_at>now());`);
  }
  async down(q: QueryRunner): Promise<void> {
    await q.query(
      'DROP TRIGGER sessions_login_history ON sessions; DROP FUNCTION capture_login_history(); DROP TABLE login_history;',
    );
  }
}
