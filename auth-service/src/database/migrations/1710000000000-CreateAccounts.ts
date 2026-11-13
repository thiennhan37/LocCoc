import type { MigrationInterface, QueryRunner } from 'typeorm';

/** Initial auth identity schema using accounts table. Keep this migration append-only. */
export class CreateAccounts1710000000000 implements MigrationInterface {
  name = 'CreateAccounts1710000000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('CREATE EXTENSION IF NOT EXISTS "pgcrypto"');
    await queryRunner.query(`
      CREATE TYPE "account_role_enum" AS ENUM ('user', 'moderator', 'admin')
    `);
    await queryRunner.query(`
      CREATE TYPE "account_status_enum" AS ENUM ('pending_verification', 'active', 'suspended')
    `);
    await queryRunner.query(`
      CREATE TABLE "accounts" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "email" varchar(320) NOT NULL,
        "phone" varchar(32),
        "password_hash" text NOT NULL,
        "role" "account_role_enum" NOT NULL DEFAULT 'user',
        "status" "account_status_enum" NOT NULL DEFAULT 'pending_verification',
        "email_verified_at" TIMESTAMPTZ,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMPTZ,
        CONSTRAINT "PK_accounts_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_accounts_email" UNIQUE ("email"),
        CONSTRAINT "UQ_accounts_phone" UNIQUE ("phone"),
        CONSTRAINT "CK_accounts_email_lowercase" CHECK ("email" = lower("email")),
        CONSTRAINT "CK_accounts_phone_e164" CHECK ("phone" IS NULL OR "phone" ~ '^\\+[1-9][0-9]{7,14}$')
      )
    `);
    await queryRunner.query('CREATE INDEX "IDX_accounts_email_login" ON "accounts" (lower("email")) WHERE "deleted_at" IS NULL');
    await queryRunner.query('CREATE INDEX "IDX_accounts_phone_login" ON "accounts" ("phone") WHERE "deleted_at" IS NULL');
    await queryRunner.query('CREATE INDEX "IDX_accounts_status" ON "accounts" ("status") WHERE "deleted_at" IS NULL');
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_accounts_status"');
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_accounts_phone_login"');
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_accounts_email_login"');
    await queryRunner.query('DROP TABLE IF EXISTS "accounts"');
    await queryRunner.query('DROP TYPE IF EXISTS "account_status_enum"');
    await queryRunner.query('DROP TYPE IF EXISTS "account_role_enum"');
  }
}
