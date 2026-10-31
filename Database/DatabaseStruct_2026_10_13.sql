CREATE TABLE users (
                       id            BINARY(16) PRIMARY KEY,          -- UUID dạng binary (hoặc BIGINT snowflake)
                       username      VARCHAR(30)  NOT NULL UNIQUE,
                       display_name  VARCHAR(60),
                       email         VARCHAR(255) UNIQUE,
                       phone         VARCHAR(20)  UNIQUE,
                       password_hash VARCHAR(255),
                       avatar_url    VARCHAR(500),
                       status        TINYINT NOT NULL DEFAULT 1,      -- 1 active, 2 banned, 3 deleted
                       created_at    DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB;

CREATE TABLE user_devices (
                              id             BINARY(16) PRIMARY KEY,
                              user_id        BINARY(16) NOT NULL,
                              push_token     VARCHAR(512) NOT NULL,
                              platform       VARCHAR(10),
                              last_active_at DATETIME(3),
                              UNIQUE KEY uq_push_token (push_token(255)),
                              KEY idx_dev_user (user_id),
                              CONSTRAINT fk_dev_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE moments (
                         id          BINARY(16) PRIMARY KEY,
                         owner_id    BINARY(16) NOT NULL,
                         media_key   VARCHAR(500) NOT NULL,
                         media_type  TINYINT NOT NULL DEFAULT 0,        -- 0 ảnh, 1 video
                         thumb_key   VARCHAR(500),
                         caption     VARCHAR(200),
                         width       INT, height INT,
                         created_at  DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
                         deleted_at  DATETIME(3),
                         KEY idx_moments_owner (owner_id, created_at DESC),
                         CONSTRAINT fk_moment_owner FOREIGN KEY (owner_id) REFERENCES users(id)
) ENGINE=InnoDB;

-- Ai được xem moment nào (fan-out on write, danh sách người nhận lấy từ Neo4j)
CREATE TABLE moment_recipients (
                                   moment_id    BINARY(16) NOT NULL,
                                   recipient_id BINARY(16) NOT NULL,
                                   created_at   DATETIME(3) NOT NULL,
                                   seen_at      DATETIME(3),
                                   PRIMARY KEY (moment_id, recipient_id),
                                   KEY idx_feed (recipient_id, created_at DESC),
                                   CONSTRAINT fk_mr_moment FOREIGN KEY (moment_id) REFERENCES moments(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE reactions (
                           moment_id  BINARY(16) NOT NULL,
                           user_id    BINARY(16) NOT NULL,
                           emoji      VARCHAR(16) NOT NULL,
                           created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
                           PRIMARY KEY (moment_id, user_id),
                           CONSTRAINT fk_react_moment FOREIGN KEY (moment_id) REFERENCES moments(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE conversations (
                               id              BINARY(16) PRIMARY KEY,
                               user_low        BINARY(16) NOT NULL,
                               user_high       BINARY(16) NOT NULL,
                               last_message_at DATETIME(3),
                               UNIQUE KEY uq_pair (user_low, user_high),
                               CONSTRAINT chk_order CHECK (user_low < user_high)
) ENGINE=InnoDB;

CREATE TABLE messages (
                          id              BINARY(16) PRIMARY KEY,
                          conversation_id BINARY(16) NOT NULL,
                          sender_id       BINARY(16) NOT NULL,
                          moment_id       BINARY(16),
                          type            TINYINT NOT NULL DEFAULT 0,
                          content         TEXT,
                          created_at      DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
                          read_at         DATETIME(3),
                          KEY idx_msg_conv (conversation_id, created_at DESC),
                          CONSTRAINT fk_msg_conv FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE notifications (
                               id         BINARY(16) PRIMARY KEY,
                               user_id    BINARY(16) NOT NULL,
                               type       VARCHAR(30) NOT NULL,
                               payload    JSON,
                               is_read    TINYINT(1) NOT NULL DEFAULT 0,
                               created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
                               KEY idx_notif_user (user_id, created_at DESC)
) ENGINE=InnoDB;