import type { MigrationInterface, QueryRunner } from 'typeorm';

export class DiscoveryRefreshLeases1794441600000 implements MigrationInterface {
  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      ALTER TABLE discovery_refresh_queue
        ADD COLUMN priority smallint NOT NULL DEFAULT 0 CHECK(priority BETWEEN 0 AND 2),
        ADD COLUMN request_version bigint NOT NULL DEFAULT 1,
        ADD COLUMN lease_token uuid, ADD COLUMN lease_until timestamptz,
        ADD COLUMN available_at timestamptz NOT NULL DEFAULT clock_timestamp();
      CREATE INDEX discovery_refresh_priority ON discovery_refresh_queue(priority DESC,requested_at,user_id);
      CREATE FUNCTION request_discovery_refresh(a uuid,p smallint DEFAULT 2) RETURNS void LANGUAGE sql AS $$
        INSERT INTO discovery_refresh_queue(user_id,priority) VALUES(a,p)
        ON CONFLICT(user_id) DO UPDATE SET
          priority=GREATEST(discovery_refresh_queue.priority,EXCLUDED.priority),
          request_version=discovery_refresh_queue.request_version+1,
          available_at=clock_timestamp();
      $$;
      CREATE OR REPLACE FUNCTION snapshot_social_pair(a uuid,b uuid) RETURNS void LANGUAGE plpgsql AS $$
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
        PERFORM request_discovery_refresh(lo,2::smallint);
        PERFORM request_discovery_refresh(hi,2::smallint);
      END $$;

    `);
  }
  async down(q: QueryRunner): Promise<void> {
    // Restore the old function's queue contract before dropping added columns.
    await q.query(`
      CREATE OR REPLACE FUNCTION snapshot_social_pair(a uuid,b uuid) RETURNS void LANGUAGE plpgsql AS $$
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

      DROP FUNCTION request_discovery_refresh(uuid,smallint);
      DROP INDEX discovery_refresh_priority;
      ALTER TABLE discovery_refresh_queue DROP COLUMN priority,DROP COLUMN request_version,
        DROP COLUMN lease_token,DROP COLUMN lease_until,DROP COLUMN available_at;
    `);
  }
}
