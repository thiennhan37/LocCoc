import type { MigrationInterface, QueryRunner } from 'typeorm';

export class UserSocial1793145600000 implements MigrationInterface {
  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      ALTER TABLE users RENAME COLUMN full_name TO display_name;
      ALTER TABLE users ADD COLUMN username varchar(30),
        ADD COLUMN account_status varchar(32) NOT NULL DEFAULT 'pending_verification',
        ADD COLUMN account_version bigint NOT NULL DEFAULT 0,
        ADD CONSTRAINT chk_username CHECK(username IS NULL OR username ~ '^[a-z0-9_]{2,30}$'),
        ADD CONSTRAINT chk_account_status CHECK(account_status IN ('pending_verification','active','suspended','deleted'));
      CREATE UNIQUE INDEX uq_users_username ON users(username);
      CREATE INDEX idx_users_username_prefix ON users(username varchar_pattern_ops) WHERE deleted_at IS NULL AND account_status='active';
      CREATE FUNCTION immutable_username() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF OLD.username IS NOT NULL AND NEW.username IS DISTINCT FROM OLD.username THEN
          RAISE EXCEPTION 'Username cannot be changed' USING ERRCODE='23514';
        END IF; RETURN NEW;
      END $$;
      CREATE TRIGGER users_immutable_username BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION immutable_username();
      CREATE TABLE friend_requests (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        sender_id uuid NOT NULL REFERENCES users(id), receiver_id uuid NOT NULL REFERENCES users(id),
        status varchar(16) NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','ACCEPTED','REJECTED','CANCELLED')),
        created_at timestamptz NOT NULL DEFAULT now(), resolved_at timestamptz,
        CHECK(sender_id <> receiver_id), CHECK((status='PENDING') = (resolved_at IS NULL))
      );
      CREATE UNIQUE INDEX uq_friend_requests_pending_pair ON friend_requests
        (LEAST(sender_id,receiver_id), GREATEST(sender_id,receiver_id)) WHERE status='PENDING';
      CREATE INDEX idx_friend_requests_incoming ON friend_requests(receiver_id,created_at DESC,id) WHERE status='PENDING';
      CREATE INDEX idx_friend_requests_outgoing ON friend_requests(sender_id,created_at DESC,id) WHERE status='PENDING';
      CREATE TABLE friendships (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_low_id uuid NOT NULL REFERENCES users(id),
        user_high_id uuid NOT NULL REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now(),
        CHECK(user_low_id < user_high_id), UNIQUE(user_low_id,user_high_id)
      );
      CREATE INDEX idx_friendships_high ON friendships(user_high_id);
      CREATE TABLE user_blocks (
        blocker_id uuid NOT NULL REFERENCES users(id), blocked_id uuid NOT NULL REFERENCES users(id),
        created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(blocker_id,blocked_id), CHECK(blocker_id<>blocked_id)
      );
      CREATE INDEX idx_user_blocks_blocked ON user_blocks(blocked_id,blocker_id);
    `);
  }
  async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE user_blocks, friendships, friend_requests;
      DROP TRIGGER users_immutable_username ON users; DROP FUNCTION immutable_username();
      DROP INDEX idx_users_username_prefix; DROP INDEX uq_users_username;
      ALTER TABLE users DROP CONSTRAINT chk_username, DROP CONSTRAINT chk_account_status,
        DROP COLUMN username, DROP COLUMN account_status, DROP COLUMN account_version;
      ALTER TABLE users RENAME COLUMN display_name TO full_name;`);
  }
}
