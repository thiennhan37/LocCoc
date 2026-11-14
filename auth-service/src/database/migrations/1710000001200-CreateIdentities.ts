import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateIdentities1710000001200 implements MigrationInterface {
  name = 'CreateIdentities1710000001200';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE "accounts" ALTER COLUMN "password_hash" DROP NOT NULL');
    await queryRunner.query(`
      CREATE TABLE "identities" (
        "user_id" uuid NOT NULL,
        "provider" varchar(16) NOT NULL,
        "provider_user_id" varchar(255) NOT NULL,
        "email" varchar(320),
        "display_name" varchar(200),
        "is_private_email" boolean NOT NULL DEFAULT false,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_identities_provider_subject" PRIMARY KEY ("provider", "provider_user_id"),
        CONSTRAINT "FK_identities_user_id" FOREIGN KEY ("user_id") REFERENCES "accounts"("id") ON DELETE CASCADE,
        CONSTRAINT "CK_identities_provider" CHECK ("provider" IN ('google', 'apple')),
        CONSTRAINT "CK_identities_subject" CHECK (length("provider_user_id") > 0),
        CONSTRAINT "CK_identities_email_lowercase" CHECK ("email" IS NULL OR "email" = lower("email"))
      )
    `);
    await queryRunner.query('CREATE INDEX "IDX_identities_user_id" ON "identities" ("user_id")');
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    // Fails before dropping identities if passwordless accounts still exist.
    await queryRunner.query('ALTER TABLE "accounts" ALTER COLUMN "password_hash" SET NOT NULL');
    await queryRunner.query('DROP TABLE "identities"');
  }
}
