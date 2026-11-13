import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateRefreshTokens1710000001100 implements MigrationInterface {
  name = 'CreateRefreshTokens1710000001100';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "refresh_tokens" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "session_id" uuid NOT NULL,
        "user_id" uuid NOT NULL,
        "token_hash" char(64) NOT NULL,
        "issued_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "expires_at" TIMESTAMPTZ NOT NULL,
        "used_at" TIMESTAMPTZ,
        "revoked_at" TIMESTAMPTZ,
        "reuse_detected_at" TIMESTAMPTZ,
        CONSTRAINT "PK_refresh_tokens_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_refresh_tokens_token_hash" UNIQUE ("token_hash"),
        CONSTRAINT "FK_refresh_tokens_session_id" FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_refresh_tokens_user_id" FOREIGN KEY ("user_id") REFERENCES "accounts"("id") ON DELETE CASCADE
      )
    `);
    // Preserve current refresh tokens when upgrading existing sessions. Earlier
    // rotations cannot be reconstructed because only the latest hash was stored.
    await queryRunner.query(`
      INSERT INTO "refresh_tokens" (
        "session_id", "user_id", "token_hash", "issued_at", "expires_at", "revoked_at"
      )
      SELECT "id", "user_id", "refresh_token_hash", "last_used_at", "expires_at", "revoked_at"
      FROM "sessions"
    `);
    await queryRunner.query('CREATE INDEX "IDX_refresh_tokens_session_id" ON "refresh_tokens" ("session_id")');
    await queryRunner.query('CREATE INDEX "IDX_refresh_tokens_expires_at" ON "refresh_tokens" ("expires_at")');
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_refresh_tokens_expires_at"');
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_refresh_tokens_session_id"');
    await queryRunner.query('DROP TABLE IF EXISTS "refresh_tokens"');
  }
}