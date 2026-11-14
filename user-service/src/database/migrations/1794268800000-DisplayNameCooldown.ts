import type { MigrationInterface, QueryRunner } from 'typeorm';

export class DisplayNameCooldown1794268800000 implements MigrationInterface {
  name = 'DisplayNameCooldown1794268800000';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      ALTER TABLE users ADD COLUMN last_display_name_changed_at timestamptz;
      CREATE TABLE display_name_changes (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id uuid NOT NULL REFERENCES users(id),
        actor_id uuid NOT NULL,
        actor_type varchar(5) NOT NULL CHECK(actor_type IN ('USER','ADMIN')),
        old_name varchar(255),
        new_name varchar(255) NOT NULL,
        changed_at timestamptz NOT NULL DEFAULT clock_timestamp()
      );
      CREATE INDEX idx_display_name_changes_user ON display_name_changes(user_id,changed_at DESC,id DESC);
    `);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE display_name_changes;
      ALTER TABLE users DROP COLUMN last_display_name_changed_at;`);
  }
}
