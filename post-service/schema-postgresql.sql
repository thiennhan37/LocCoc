-- Dedicated post-service PostgreSQL schema (aligned with Database/DatabaseStruct_PostgreSQL.sql).
-- Run against the posts database; owner_id / recipient_id / user_id reference IAM Account/User UUIDs across services.
CREATE TABLE IF NOT EXISTS moments (
    id UUID PRIMARY KEY,
    owner_id UUID NOT NULL,
    media_key VARCHAR(500) NOT NULL,
    media_type SMALLINT NOT NULL DEFAULT 0 CHECK (media_type IN (0, 1)), -- 0 ảnh, 1 video
    thumb_key VARCHAR(500),
    caption VARCHAR(200),
    width INT CHECK (width > 0),
    height INT CHECK (height > 0),
    created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    deleted_at TIMESTAMPTZ(3)
);
CREATE INDEX IF NOT EXISTS idx_moments_owner ON moments (owner_id, created_at DESC);

-- First-view history includes the owner's own posts, independently of delivery snapshots.
CREATE TABLE IF NOT EXISTS post_views (
    id VARCHAR(73) PRIMARY KEY,
    viewer_id UUID NOT NULL,
    post_id UUID NOT NULL,
    seen_at TIMESTAMPTZ NOT NULL,
    UNIQUE (viewer_id, post_id)
);

-- Current reactions API; independent of the legacy reactions table below.
CREATE TABLE IF NOT EXISTS post_reactions (
    id VARCHAR(73) PRIMARY KEY,
    viewer_id UUID NOT NULL,
    post_id UUID NOT NULL,
    emoji VARCHAR(8) NOT NULL,
    CONSTRAINT uq_post_reaction_viewer UNIQUE (viewer_id, post_id)
);
CREATE INDEX IF NOT EXISTS idx_post_reactions_post ON post_reactions (post_id);

-- Snapshot người nhận tại lúc gửi, giữ nguyên mô hình fan-out on write.
CREATE TABLE IF NOT EXISTS moment_recipients (
    moment_id UUID NOT NULL,
    recipient_id UUID NOT NULL,
    created_at TIMESTAMPTZ(3) NOT NULL,
    seen_at TIMESTAMPTZ(3),
    PRIMARY KEY (moment_id, recipient_id),
    CONSTRAINT fk_mr_moment FOREIGN KEY (moment_id) REFERENCES moments(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_feed ON moment_recipients (recipient_id, created_at DESC);

-- Persist the claim before any paid AI request; no private image is stored here.
CREATE TABLE IF NOT EXISTS ai_preview_attempts (
    id UUID PRIMARY KEY,
    owner_id UUID NOT NULL,
    created_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ai_attempt_owner_created ON ai_preview_attempts (owner_id, created_at);

CREATE TABLE IF NOT EXISTS reactions (
    moment_id UUID NOT NULL,
    user_id UUID NOT NULL,
    emoji VARCHAR(16) NOT NULL,
    created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (moment_id, user_id),
    CONSTRAINT fk_react_moment FOREIGN KEY (moment_id) REFERENCES moments(id) ON DELETE CASCADE
);
