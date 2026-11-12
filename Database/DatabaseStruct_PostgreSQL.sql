-- PostgreSQL 17: bản chuyển dialect từ DatabaseStruct_2026_10_13.sql.
-- Chạy trên database/schema trống; KHÔNG phải migration cho Auth/User hiện tại.
-- Giữ nguyên 8 bảng, các FK và quy tắc nghiệp vụ của file gốc.
-- UUID do ứng dụng cấp; TIMESTAMPTZ lưu thời điểm, hiển thị theo timezone session.
BEGIN;

CREATE TABLE users (
    id UUID PRIMARY KEY,
    username VARCHAR(30) NOT NULL UNIQUE,
    display_name VARCHAR(60),
    email VARCHAR(255) UNIQUE,
    phone VARCHAR(20) UNIQUE,
    password_hash VARCHAR(255),
    avatar_url VARCHAR(500),
    status SMALLINT NOT NULL DEFAULT 1, -- 1 active, 2 banned, 3 deleted
    created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
);

CREATE TABLE user_devices (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL,
    push_token VARCHAR(512) NOT NULL,
    platform VARCHAR(10),
    last_active_at TIMESTAMPTZ(3),
    CONSTRAINT fk_dev_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
-- Giữ nguyên unique tiền tố 255 ký tự của file MySQL, không đổi sang toàn token.
CREATE UNIQUE INDEX uq_push_token ON user_devices (left(push_token, 255));
CREATE INDEX idx_dev_user ON user_devices (user_id);

CREATE TABLE moments (
    id UUID PRIMARY KEY,
    owner_id UUID NOT NULL,
    media_key VARCHAR(500) NOT NULL,
    media_type SMALLINT NOT NULL DEFAULT 0, -- 0 ảnh, 1 video
    thumb_key VARCHAR(500),
    caption VARCHAR(200),
    width INT,
    height INT,
    created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    deleted_at TIMESTAMPTZ(3),
    CONSTRAINT fk_moment_owner FOREIGN KEY (owner_id) REFERENCES users(id)
);
CREATE INDEX idx_moments_owner ON moments (owner_id, created_at DESC);

-- Snapshot người nhận tại lúc gửi, giữ nguyên mô hình fan-out on write.
CREATE TABLE moment_recipients (
    moment_id UUID NOT NULL,
    recipient_id UUID NOT NULL,
    created_at TIMESTAMPTZ(3) NOT NULL,
    seen_at TIMESTAMPTZ(3),
    PRIMARY KEY (moment_id, recipient_id),
    CONSTRAINT fk_mr_moment FOREIGN KEY (moment_id) REFERENCES moments(id) ON DELETE CASCADE
);
CREATE INDEX idx_feed ON moment_recipients (recipient_id, created_at DESC);

CREATE TABLE reactions (
    moment_id UUID NOT NULL,
    user_id UUID NOT NULL,
    emoji VARCHAR(16) NOT NULL,
    created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (moment_id, user_id),
    CONSTRAINT fk_react_moment FOREIGN KEY (moment_id) REFERENCES moments(id) ON DELETE CASCADE
);

CREATE TABLE conversations (
    id UUID PRIMARY KEY,
    user_low UUID NOT NULL,
    user_high UUID NOT NULL,
    last_message_at TIMESTAMPTZ(3),
    CONSTRAINT uq_pair UNIQUE (user_low, user_high),
    CONSTRAINT chk_order CHECK (user_low < user_high)
);

CREATE TABLE messages (
    id UUID PRIMARY KEY,
    conversation_id UUID NOT NULL,
    sender_id UUID NOT NULL,
    moment_id UUID,
    type SMALLINT NOT NULL DEFAULT 0,
    content TEXT,
    created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    read_at TIMESTAMPTZ(3),
    CONSTRAINT fk_msg_conv FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
);
CREATE INDEX idx_msg_conv ON messages (conversation_id, created_at DESC);

CREATE TABLE notifications (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL,
    type VARCHAR(30) NOT NULL,
    payload JSONB,
    is_read BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
);
CREATE INDEX idx_notif_user ON notifications (user_id, created_at DESC);

COMMIT;
