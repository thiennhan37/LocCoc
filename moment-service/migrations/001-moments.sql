CREATE TABLE IF NOT EXISTS moment_schema_migrations (version integer PRIMARY KEY);
CREATE TABLE IF NOT EXISTS moment_deleted_accounts (owner_id uuid PRIMARY KEY,version bigint NOT NULL);
CREATE TABLE IF NOT EXISTS moments (
  id uuid PRIMARY KEY, owner_id uuid NOT NULL, asset_id uuid NOT NULL UNIQUE,
  asset_version integer NOT NULL DEFAULT 1 CHECK (asset_version > 0),
  state text NOT NULL DEFAULT 'draft' CHECK (state IN ('draft','active','deleted')),
  caption text NOT NULL DEFAULT '', tags text[] NOT NULL DEFAULT '{}',
  captured_at timestamptz NOT NULL DEFAULT now(), album_id uuid, place text,
  object_key text, checksum text, index_status text NOT NULL DEFAULT 'pending'
    CHECK (index_status IN ('pending','ready','failed')),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS moments_owner_date ON moments(owner_id,captured_at DESC,id DESC) WHERE state='active';
CREATE INDEX IF NOT EXISTS moments_text ON moments USING gin(to_tsvector('simple',caption));
CREATE TABLE IF NOT EXISTS moment_jobs (
  id uuid PRIMARY KEY, moment_id uuid NOT NULL REFERENCES moments(id),
  operation text NOT NULL CHECK (operation IN ('index','delete','object_cleanup')),
  asset_version integer NOT NULL, object_key text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','running','done','failed')),
  attempts integer NOT NULL DEFAULT 0, lease uuid, lease_until timestamptz,
  available_at timestamptz NOT NULL DEFAULT now(), error_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(moment_id,operation,asset_version)
);
CREATE INDEX IF NOT EXISTS moment_jobs_pending ON moment_jobs(available_at) WHERE status IN ('pending','running');
-- Staged objects are registered BEFORE storage PUT, so crash recovery can remove
-- an orphan even if the process died before its upload transaction committed.
CREATE TABLE IF NOT EXISTS moment_staged_objects (
  object_key text PRIMARY KEY, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS moment_upload_limits (
  owner_id uuid NOT NULL, hour timestamptz NOT NULL, used integer NOT NULL,
  PRIMARY KEY(owner_id,hour)
);
INSERT INTO moment_schema_migrations(version) VALUES(1) ON CONFLICT DO NOTHING;
