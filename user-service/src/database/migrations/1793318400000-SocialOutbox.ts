import type { MigrationInterface, QueryRunner } from 'typeorm';
export class SocialOutbox1793318400000 implements MigrationInterface {
  async up(q: QueryRunner): Promise<void> {
    await q.query(`
 CREATE TABLE social_outbox(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), aggregate_id uuid NOT NULL,
 payload jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT clock_timestamp(), published_at timestamptz);
 CREATE INDEX social_outbox_pending ON social_outbox(created_at,id) WHERE published_at IS NULL;
 CREATE FUNCTION emit_friend_notification() RETURNS trigger LANGUAGE plpgsql AS $$
 DECLARE actor_id uuid; recipient_id uuid; kind text; actor jsonb; eid uuid := gen_random_uuid();
 BEGIN
 IF TG_OP='INSERT' THEN actor_id:=NEW.sender_id; recipient_id:=NEW.receiver_id; kind:='FRIEND_REQUEST_RECEIVED';
 ELSIF OLD.status='PENDING' AND NEW.status='ACCEPTED' THEN
 actor_id:=NEW.receiver_id; recipient_id:=NEW.sender_id; kind:='FRIEND_REQUEST_ACCEPTED';
 ELSE RETURN NEW; END IF;
 SELECT jsonb_build_object('id',id,'displayName',COALESCE(display_name,username),'avatarUrl',avatar_url)
 INTO actor FROM users WHERE id=actor_id;
 INSERT INTO social_outbox(id,aggregate_id,payload) VALUES(eid,NEW.id,jsonb_build_object(
 'eventId',eid,'eventType',kind,'aggregateId',NEW.id,'timestamp',clock_timestamp(),'version',1,
 'data',jsonb_build_object('recipientId',recipient_id,'actor',actor,'friendRequestId',NEW.id)));
 RETURN NEW; END $$;
 CREATE TRIGGER friend_notification AFTER INSERT OR UPDATE ON friend_requests
 FOR EACH ROW EXECUTE FUNCTION emit_friend_notification();
 `);
  }
  async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TRIGGER friend_notification ON friend_requests;
 DROP FUNCTION emit_friend_notification(); DROP TABLE social_outbox;`);
  }
}
