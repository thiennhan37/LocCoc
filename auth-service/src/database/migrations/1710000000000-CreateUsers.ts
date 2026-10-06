import type { MigrationInterface, QueryRunner } from 'typeorm';

/** Initial auth identity schema. Keep this migration append-only. */
export class CreateUsers1710000000000 implements MigrationInterface {
  name = 'CreateUsers1710000000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('CREATE EXTENSION IF NOT EXISTS "pgcrypto"');
    await queryRunner.query(`
      CREATE TYPE "user_role_enum" AS ENUM ('user', 'moderator', 'admin')
    `);
    await queryRunner.query(`
      CREATE TYPE "user_status_enum" AS ENUM ('pending_verification', 'active', 'suspended')
    `);
    await queryRunner.query(`
      CREATE TABLE "users" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "email" varchar(320) NOT NULL,
        "phone" varchar(32),
        "password_hash" text NOT NULL,
        "role" "user_role_enum" NOT NULL DEFAULT 'user',
        "status" "user_status_enum" NOT NULL DEFAULT 'pending_verification',
        "email_verified_at" TIMESTAMPTZ,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMPTZ,
        CONSTRAINT "PK_users_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_users_email" UNIQUE ("email"),
        CONSTRAINT "UQ_users_phone" UNIQUE ("phone"),
        CONSTRAINT "CK_users_email_lowercase" CHECK ("email" = lower("email")),
        CONSTRAINT "CK_users_phone_e164" CHECK ("phone" IS NULL OR "phone" ~ '^\\+[1-9][0-9]{7,14}$')
      )
    `);
    // Email is normalized before persistence; this index also supports
    // explicit lower(email) lookups from older rows/imports.
    await queryRunner.query('CREATE INDEX "IDX_users_email_login" ON "users" (lower("email")) WHERE "deleted_at" IS NULL');
    await queryRunner.query('CREATE INDEX "IDX_users_phone_login" ON "users" ("phone") WHERE "deleted_at" IS NULL');
    await queryRunner.query('CREATE INDEX "IDX_users_status" ON "users" ("status") WHERE "deleted_at" IS NULL');
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_users_status"');
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_users_phone_login"');
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_users_email_login"');
    await queryRunner.query('DROP TABLE IF EXISTS "users"');
    await queryRunner.query('DROP TYPE IF EXISTS "user_status_enum"');
    await queryRunner.query('DROP TYPE IF EXISTS "user_role_enum"');
  }
}
