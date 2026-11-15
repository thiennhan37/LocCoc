import type { MigrationInterface, QueryRunner } from 'typeorm';

export class SmartDiscovery1794355200000 implements MigrationInterface {
  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE EXTENSION IF NOT EXISTS unaccent WITH SCHEMA public;
      CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA public;
      ALTER TABLE users ADD COLUMN display_name_norm text NOT NULL DEFAULT '',
        ADD COLUMN recommendable boolean NOT NULL DEFAULT true,
        ADD COLUMN mutual_friends_visibility boolean NOT NULL DEFAULT true,
        ADD COLUMN profile_version bigint NOT NULL DEFAULT 1;
      UPDATE users SET display_name_norm=lower(public.unaccent(COALESCE(display_name,'')));
      CREATE INDEX users_name_trgm ON users USING gin(display_name_norm gin_trgm_ops)
        WHERE deleted_at IS NULL AND account_status='active' AND username IS NOT NULL;
      CREATE TABLE pair_states (
        user_low_id uuid NOT NULL REFERENCES users(id), user_high_id uuid NOT NULL REFERENCES users(id),
        pair_version bigint NOT NULL DEFAULT 0, updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
        PRIMARY KEY(user_low_id,user_high_id), CHECK(user_low_id<user_high_id));
      CREATE TABLE suggestion_feedback (
        viewer_id uuid NOT NULL REFERENCES users(id), target_id uuid NOT NULL REFERENCES users(id),
        reason varchar(16) NOT NULL CHECK(reason IN ('DISMISS','REJECT','CANCEL','UNFRIEND')),
        expires_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
        PRIMARY KEY(viewer_id,target_id,reason), CHECK(viewer_id<>target_id));
      CREATE INDEX suggestion_feedback_expiry ON suggestion_feedback(expires_at);
      CREATE TABLE graph_outbox (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(), partition_key text NOT NULL,
        payload jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
        published_at timestamptz);
      CREATE INDEX graph_outbox_pending ON graph_outbox(created_at,id) WHERE published_at IS NULL;
      CREATE TABLE graph_projection_offsets (
        topic text NOT NULL, partition integer NOT NULL, next_offset bigint NOT NULL,
        updated_at timestamptz NOT NULL DEFAULT clock_timestamp(), PRIMARY KEY(topic,partition));
      CREATE TABLE discovery_refresh_queue (
        user_id uuid PRIMARY KEY REFERENCES users(id), requested_at timestamptz NOT NULL DEFAULT clock_timestamp());
      CREATE TABLE discovery_search_sessions (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(), viewer_id uuid NOT NULL REFERENCES users(id),
        query text NOT NULL, candidates uuid[] NOT NULL, degraded boolean NOT NULL,
        expires_at timestamptz NOT NULL DEFAULT clock_timestamp()+interval '2 minutes');
      CREATE INDEX discovery_search_expiry ON discovery_search_sessions(expires_at);

      CREATE FUNCTION lock_social_pair(a uuid,b uuid) RETURNS void LANGUAGE plpgsql AS $$
      BEGIN
        INSERT INTO pair_states(user_low_id,user_high_id) VALUES(LEAST(a,b),GREATEST(a,b)) ON CONFLICT DO NOTHING;
        PERFORM 1 FROM pair_states WHERE user_low_id=LEAST(a,b) AND user_high_id=GREATEST(a,b) FOR UPDATE;
      END $$;
      CREATE FUNCTION snapshot_social_pair(a uuid,b uuid) RETURNS void LANGUAGE plpgsql AS $$
      DECLARE lo uuid:=LEAST(a,b); hi uuid:=GREATEST(a,b); v bigint; eid uuid:=gen_random_uuid();
      BEGIN
        PERFORM lock_social_pair(a,b);
        UPDATE pair_states SET pair_version=pair_version+1,updated_at=clock_timestamp()
          WHERE user_low_id=lo AND user_high_id=hi RETURNING pair_version INTO v;
        INSERT INTO graph_outbox(id,partition_key,payload) VALUES(eid,lo||':'||hi,jsonb_build_object(
          'eventId',eid,'eventType','PAIR_STATE_SNAPSHOT','version',1,'pairVersion',v,
          'lowId',lo,'highId',hi,
          'friends',EXISTS(SELECT 1 FROM friendships WHERE user_low_id=lo AND user_high_id=hi),
          'requestedBy',(SELECT sender_id FROM friend_requests WHERE LEAST(sender_id,receiver_id)=lo
            AND GREATEST(sender_id,receiver_id)=hi AND status='PENDING'),
          'lowBlocksHigh',EXISTS(SELECT 1 FROM user_blocks WHERE blocker_id=lo AND blocked_id=hi),
          'highBlocksLow',EXISTS(SELECT 1 FROM user_blocks WHERE blocker_id=hi AND blocked_id=lo)));
        INSERT INTO discovery_refresh_queue(user_id) VALUES(lo),(hi) ON CONFLICT(user_id)
          DO UPDATE SET requested_at=clock_timestamp();
      END $$;
      CREATE FUNCTION capture_social_pair() RETURNS trigger LANGUAGE plpgsql AS $$
      DECLARE row_data jsonb;
      BEGIN
        IF TG_OP='DELETE' THEN row_data:=to_jsonb(OLD); ELSE row_data:=to_jsonb(NEW); END IF;
        IF TG_TABLE_NAME='friendships' THEN
          PERFORM snapshot_social_pair((row_data->>'user_low_id')::uuid,(row_data->>'user_high_id')::uuid);
        ELSIF TG_TABLE_NAME='friend_requests' THEN
          PERFORM snapshot_social_pair((row_data->>'sender_id')::uuid,(row_data->>'receiver_id')::uuid);
        ELSE
          PERFORM snapshot_social_pair((row_data->>'blocker_id')::uuid,(row_data->>'blocked_id')::uuid);
        END IF;
        RETURN NULL;
      END $$;
      CREATE TRIGGER graph_friendship AFTER INSERT OR DELETE ON friendships FOR EACH ROW EXECUTE FUNCTION capture_social_pair();
      CREATE TRIGGER graph_request AFTER INSERT OR UPDATE ON friend_requests FOR EACH ROW EXECUTE FUNCTION capture_social_pair();
      CREATE TRIGGER graph_block AFTER INSERT OR DELETE ON user_blocks FOR EACH ROW EXECUTE FUNCTION capture_social_pair();

      CREATE FUNCTION normalize_discovery_profile() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        NEW.display_name_norm:=lower(public.unaccent(COALESCE(NEW.display_name,'')));
        IF TG_OP='UPDATE' THEN
          IF (NEW.username,NEW.display_name,NEW.recommendable,NEW.mutual_friends_visibility)
            IS DISTINCT FROM (OLD.username,OLD.display_name,OLD.recommendable,OLD.mutual_friends_visibility) THEN
            NEW.profile_version:=OLD.profile_version+1;
          ELSE NEW.profile_version:=OLD.profile_version; END IF;
        END IF;
        RETURN NEW;
      END $$;
      CREATE FUNCTION capture_discovery_profile() RETURNS trigger LANGUAGE plpgsql AS $$
      DECLARE eid uuid:=gen_random_uuid();
      BEGIN
        IF TG_OP='UPDATE' AND NEW.profile_version=OLD.profile_version THEN RETURN NULL; END IF;
        INSERT INTO graph_outbox(id,partition_key,payload) VALUES(eid,NEW.id::text,jsonb_build_object(
          'eventId',eid,'eventType','USER_PROFILE_SNAPSHOT','version',1,'userId',NEW.id,
          'profileVersion',NEW.profile_version,'username',NEW.username,'displayNameNorm',NEW.display_name_norm,
          'recommendable',NEW.recommendable,'mutualVisibility',NEW.mutual_friends_visibility));
        RETURN NULL;
      END $$;
      CREATE TRIGGER discovery_profile_normalize BEFORE INSERT OR UPDATE ON users FOR EACH ROW EXECUTE FUNCTION normalize_discovery_profile();
      CREATE TRIGGER discovery_profile_event AFTER INSERT OR UPDATE ON users FOR EACH ROW EXECUTE FUNCTION capture_discovery_profile();

      INSERT INTO pair_states(user_low_id,user_high_id)
        SELECT user_low_id,user_high_id FROM friendships UNION
        SELECT LEAST(sender_id,receiver_id),GREATEST(sender_id,receiver_id) FROM friend_requests UNION
        SELECT LEAST(blocker_id,blocked_id),GREATEST(blocker_id,blocked_id) FROM user_blocks;
      SELECT snapshot_social_pair(user_low_id,user_high_id) FROM pair_states;
    `);
  }
  async down(q: QueryRunner): Promise<void> {
    await q.query(`
      DROP TRIGGER discovery_profile_event ON users; DROP TRIGGER discovery_profile_normalize ON users;
      DROP TRIGGER graph_block ON user_blocks; DROP TRIGGER graph_request ON friend_requests;
      DROP TRIGGER graph_friendship ON friendships;
      DROP FUNCTION capture_discovery_profile(),normalize_discovery_profile(),capture_social_pair();
      DROP FUNCTION snapshot_social_pair(uuid,uuid),lock_social_pair(uuid,uuid);
      DROP TABLE discovery_search_sessions,discovery_refresh_queue,graph_projection_offsets,graph_outbox,suggestion_feedback,pair_states;
      DROP INDEX users_name_trgm;
      ALTER TABLE users DROP COLUMN display_name_norm,DROP COLUMN recommendable,
        DROP COLUMN mutual_friends_visibility,DROP COLUMN profile_version;
    `);
  }
}
