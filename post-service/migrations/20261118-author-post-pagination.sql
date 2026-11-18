-- Run against the posts database with psql -v ON_ERROR_STOP=1 -f <this file>.
-- Do not wrap in a transaction: concurrent creation keeps writes available.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_moments_owner_active_page
    ON moments (owner_id, deleted_at, created_at DESC, id DESC);
