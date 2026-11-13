import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateSessions1710000001000 implements MigrationInterface {
  name = 'CreateSessions1710000001000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('CREATE EXTENSION IF NOT EXISTS "pgcrypto"');
    await queryRunner.query(`
      CREATE TABLE "sessions" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "user_id" uuid NOT NULL,
        "refresh_token_hash" char(64) NOT NULL,
        "device_info" jsonb,
        "ip" inet,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "last_used_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "expires_at" TIMESTAMPTZ NOT NULL,
        "revoked_at" TIMESTAMPTZ,
        CONSTRAINT "PK_sessions_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_sessions_refresh_token_hash" UNIQUE ("refresh_token_hash"),
        CONSTRAINT "FK_sessions_user_id" FOREIGN KEY ("user_id") REFERENCES "accounts"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query('CREATE INDEX "IDX_sessions_user_id" ON "sessions" ("user_id")');
    await queryRunner.query('CREATE INDEX "IDX_sessions_expires_at" ON "sessions" ("expires_at")');
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_sessions_expires_at"');
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_sessions_user_id"');
    await queryRunner.query('DROP TABLE IF EXISTS "sessions"');
  }
}