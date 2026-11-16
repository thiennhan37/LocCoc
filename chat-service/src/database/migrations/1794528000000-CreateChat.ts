import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateChat1794528000000 implements MigrationInterface {
  async up(runner: QueryRunner): Promise<void> {
    await runner.query(`
      CREATE TABLE conversations (
        id uuid PRIMARY KEY, user_low_id uuid NOT NULL, user_high_id uuid NOT NULL,
        last_sequence bigint NOT NULL DEFAULT 0 CHECK(last_sequence >= 0),
        created_at timestamptz NOT NULL DEFAULT date_trunc('milliseconds', now()),
        updated_at timestamptz NOT NULL DEFAULT date_trunc('milliseconds', now()),
        CHECK(user_low_id < user_high_id), UNIQUE(user_low_id,user_high_id)
      );
      CREATE TABLE conversation_members (
        conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
        account_id uuid NOT NULL, last_read_sequence bigint NOT NULL DEFAULT 0 CHECK(last_read_sequence >= 0),
        PRIMARY KEY(conversation_id,account_id)
      );
      CREATE INDEX chat_member_account ON conversation_members(account_id,conversation_id);
      CREATE TABLE messages (
        id uuid PRIMARY KEY, conversation_id uuid NOT NULL, sender_id uuid NOT NULL,
        client_message_id uuid NOT NULL, sequence bigint NOT NULL CHECK(sequence > 0),
        text text NOT NULL CHECK(char_length(text) BETWEEN 1 AND 2000 AND text = btrim(text)),
        created_at timestamptz NOT NULL DEFAULT date_trunc('milliseconds', clock_timestamp()),
        FOREIGN KEY(conversation_id,sender_id) REFERENCES conversation_members(conversation_id,account_id),
        UNIQUE(sender_id,client_message_id), UNIQUE(conversation_id,sequence)
      );
      CREATE INDEX chat_conversation_order ON conversations(updated_at DESC,id DESC);
    `);
  }
  async down(runner: QueryRunner): Promise<void> {
    await runner.query('DROP TABLE messages; DROP TABLE conversation_members; DROP TABLE conversations');
  }
}
