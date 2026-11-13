import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AccountEvents1793145600000 implements MigrationInterface {
  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      ALTER TABLE accounts ADD COLUMN account_version bigint NOT NULL DEFAULT 1;
      CREATE TABLE account_events (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(), account_id uuid NOT NULL,
        version bigint NOT NULL, data jsonb NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(), published_at timestamptz,
        UNIQUE(account_id, version)
      );
      CREATE INDEX idx_account_events_unpublished ON account_events(created_at) WHERE published_at IS NULL;
      CREATE FUNCTION account_snapshot(a accounts) RETURNS jsonb LANGUAGE sql AS $$
        SELECT jsonb_build_object('id', a.id, 'email', a.email, 'phone', a.phone,
          'status', CASE WHEN a.deleted_at IS NOT NULL THEN 'deleted' ELSE a.status::text END,
          'version', a.account_version)
      $$;
      CREATE FUNCTION increment_account_version() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN NEW.account_version := OLD.account_version + 1; RETURN NEW; END $$;
      CREATE TRIGGER account_version_before_update BEFORE UPDATE ON accounts
        FOR EACH ROW EXECUTE FUNCTION increment_account_version();
      CREATE FUNCTION enqueue_account_event() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        INSERT INTO account_events(account_id, version, data)
        VALUES(NEW.id, NEW.account_version, account_snapshot(NEW)); RETURN NEW;
      END $$;
      CREATE TRIGGER account_event_after_write AFTER INSERT OR UPDATE ON accounts
        FOR EACH ROW EXECUTE FUNCTION enqueue_account_event();
      INSERT INTO account_events(account_id, version, data)
        SELECT id, account_version, account_snapshot(accounts) FROM accounts;
    `);
  }
  async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TRIGGER account_event_after_write ON accounts;
      DROP TRIGGER account_version_before_update ON accounts;
      DROP FUNCTION enqueue_account_event(); DROP FUNCTION increment_account_version();
      DROP FUNCTION account_snapshot(accounts); DROP TABLE account_events;
      ALTER TABLE accounts DROP COLUMN account_version;`);
  }
}
