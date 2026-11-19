-- Run ONLY against the existing Post database; never against the legacy Moments database.
BEGIN;
ALTER TABLE moments ALTER COLUMN caption TYPE VARCHAR(1000);
ALTER TABLE moments ADD COLUMN IF NOT EXISTS visibility VARCHAR(16) NOT NULL DEFAULT 'FRIENDS';
ALTER TABLE moments ADD COLUMN IF NOT EXISTS state VARCHAR(16) NOT NULL DEFAULT 'active';
ALTER TABLE moments ADD COLUMN IF NOT EXISTS index_status VARCHAR(16) NOT NULL DEFAULT 'pending';
ALTER TABLE moments ADD COLUMN IF NOT EXISTS asset_id UUID;
ALTER TABLE moments ADD COLUMN IF NOT EXISTS asset_version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE moments ADD COLUMN IF NOT EXISTS captured_at TIMESTAMPTZ;
ALTER TABLE moments ADD COLUMN IF NOT EXISTS album_id UUID;
ALTER TABLE moments ADD COLUMN IF NOT EXISTS place VARCHAR(120);
ALTER TABLE moments ADD COLUMN IF NOT EXISTS tags_json VARCHAR(4000);
ALTER TABLE moments ADD COLUMN IF NOT EXISTS upload_hash VARCHAR(64);
ALTER TABLE moments ADD COLUMN IF NOT EXISTS legacy_source_hash VARCHAR(64);
UPDATE moments SET asset_id=id WHERE asset_id IS NULL;
UPDATE moments SET captured_at=created_at WHERE captured_at IS NULL;
UPDATE moments SET state='deleted' WHERE deleted_at IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_post_asset ON moments(asset_id);
CREATE INDEX IF NOT EXISTS idx_post_gallery ON moments(owner_id,captured_at DESC,id DESC) WHERE deleted_at IS NULL AND state='active';
CREATE TABLE IF NOT EXISTS post_accounts (
 id UUID PRIMARY KEY, deleted BOOLEAN NOT NULL DEFAULT FALSE,event_version BIGINT NOT NULL DEFAULT 0,
 upload_hour BIGINT,upload_count INTEGER
);
CREATE TABLE IF NOT EXISTS post_media_jobs (
 id UUID PRIMARY KEY,post_id UUID NOT NULL,operation VARCHAR(255) NOT NULL,
 attempts INTEGER NOT NULL DEFAULT 0,available_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,done BOOLEAN NOT NULL DEFAULT FALSE,
 UNIQUE(post_id,operation)
);
ALTER TABLE post_media_jobs ADD COLUMN IF NOT EXISTS lease UUID;
ALTER TABLE post_media_jobs ADD COLUMN IF NOT EXISTS lease_until TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_post_jobs_due ON post_media_jobs(available_at) WHERE done=FALSE;
-- Existing managed photos must also enter the index, including old tombstones needing erasure.
INSERT INTO post_media_jobs(id,post_id,operation,attempts,available_at,done)
 SELECT gen_random_uuid(),id,CASE WHEN deleted_at IS NULL THEN 'index' ELSE 'object_cleanup' END,0,CURRENT_TIMESTAMP,FALSE
 FROM moments WHERE media_key='/posts/media/' || id::text ON CONFLICT(post_id,operation) DO NOTHING;
INSERT INTO post_media_jobs(id,post_id,operation,attempts,available_at,done)
 SELECT gen_random_uuid(),id,'delete',0,CURRENT_TIMESTAMP,FALSE FROM moments WHERE deleted_at IS NOT NULL
 ON CONFLICT(post_id,operation) DO NOTHING;
COMMIT;
