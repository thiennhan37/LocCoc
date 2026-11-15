import type { MigrationInterface, QueryRunner } from 'typeorm';

export class ProfileMedia1794528000000 implements MigrationInterface {
  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      ALTER TABLE users ADD COLUMN cover_url varchar(1024);
      CREATE TABLE profile_media_objects (
        object_key varchar(256) PRIMARY KEY,
        user_id uuid NOT NULL REFERENCES users(id),
        kind varchar(8) NOT NULL CHECK(kind IN ('avatar','cover')),
        url varchar(1024) UNIQUE NOT NULL,
        state varchar(8) NOT NULL DEFAULT 'staged' CHECK(state IN ('staged','active','delete')),
        available_at timestamptz NOT NULL DEFAULT clock_timestamp()+interval '1 hour',
        created_at timestamptz NOT NULL DEFAULT clock_timestamp()
      );
      CREATE INDEX profile_media_cleanup ON profile_media_objects(available_at) WHERE state<>'active';
      CREATE FUNCTION retire_profile_media() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        UPDATE profile_media_objects SET state='delete',available_at=clock_timestamp()
        WHERE user_id=OLD.id AND state='active' AND (
          NEW.deleted_at IS NOT NULL OR NEW.account_status='deleted' OR
          (kind='avatar' AND url IS DISTINCT FROM NEW.avatar_url) OR
          (kind='cover' AND url IS DISTINCT FROM NEW.cover_url));
        RETURN NEW;
      END $$;
      CREATE TRIGGER users_retire_media AFTER UPDATE OF avatar_url,cover_url,deleted_at,account_status
        ON users FOR EACH ROW EXECUTE FUNCTION retire_profile_media();
    `);
  }
  async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TRIGGER users_retire_media ON users;
      DROP FUNCTION retire_profile_media(); DROP TABLE profile_media_objects;
      ALTER TABLE users DROP COLUMN cover_url;`);
  }
}
