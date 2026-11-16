-- Run AFTER DatabaseStruct_PostgreSQL.sql in a disposable empty database.
-- All fixture writes are rolled back; this verifies the port, not new features.
BEGIN;
DO $$
DECLARE
    a UUID := '00000000-0000-0000-0000-000000000001';
    b UUID := '00000000-0000-0000-0000-000000000002';
    m UUID := '00000000-0000-0000-0000-000000000010';
    c UUID := '00000000-0000-0000-0000-000000000020';
BEGIN
    IF (SELECT count(*) FROM information_schema.tables
        WHERE table_schema = current_schema() AND table_type = 'BASE TABLE') <> 8 THEN
        RAISE EXCEPTION 'Expected exactly 8 tables';
    END IF;
    INSERT INTO users (id, username) VALUES (a, 'alice'), (b, 'bob');
    INSERT INTO user_devices (id, user_id, push_token)
        VALUES (a, a, repeat('x', 255) || 'first');
    BEGIN
        INSERT INTO user_devices (id, user_id, push_token)
            VALUES (b, b, repeat('x', 255) || 'second');
        RAISE EXCEPTION 'Original token-prefix uniqueness was not preserved';
    EXCEPTION WHEN unique_violation THEN NULL;
    END;
    INSERT INTO moments (id, owner_id, media_key) VALUES (m, a, 'fixture/image.jpg');
    INSERT INTO moment_recipients (moment_id, recipient_id, created_at) VALUES (m, b, now());
    INSERT INTO reactions (moment_id, user_id, emoji) VALUES (m, b, '❤️');
    BEGIN
        INSERT INTO moment_recipients (moment_id, recipient_id, created_at) VALUES (m, b, now());
        RAISE EXCEPTION 'Duplicate recipient was accepted';
    EXCEPTION WHEN unique_violation THEN NULL;
    END;
    INSERT INTO conversations (id, user_low, user_high) VALUES (c, a, b);
    BEGIN
        INSERT INTO conversations (id, user_low, user_high) VALUES (b, b, a);
        RAISE EXCEPTION 'Unordered conversation pair was accepted';
    EXCEPTION WHEN check_violation THEN NULL;
    END;
    INSERT INTO messages (id, conversation_id, sender_id, moment_id, content)
        VALUES (a, c, b, m, 'hello');
    INSERT INTO notifications (id, user_id, type, payload)
        VALUES (a, b, 'reaction', '{"emoji":"❤️"}');
    IF (SELECT is_read FROM notifications WHERE id = a) IS DISTINCT FROM FALSE THEN
        RAISE EXCEPTION 'Boolean default is incorrect';
    END IF;
    IF (SELECT payload ->> 'emoji' FROM notifications WHERE id = a) <> '❤️' THEN
        RAISE EXCEPTION 'JSON/Unicode round-trip failed';
    END IF;
    DELETE FROM conversations WHERE id = c;
    IF EXISTS (SELECT 1 FROM messages WHERE conversation_id = c) THEN
        RAISE EXCEPTION 'Conversation cascade failed';
    END IF;
    DELETE FROM moments WHERE id = m;
    IF EXISTS (SELECT 1 FROM moment_recipients WHERE moment_id = m)
       OR EXISTS (SELECT 1 FROM reactions WHERE moment_id = m) THEN
        RAISE EXCEPTION 'Moment cascade failed';
    END IF;
    DELETE FROM users WHERE id = a;
    IF EXISTS (SELECT 1 FROM user_devices WHERE user_id = a) THEN
        RAISE EXCEPTION 'Device cascade failed';
    END IF;
    RAISE NOTICE 'PostgreSQL schema smoke checks passed';
END;
$$;
ROLLBACK;
