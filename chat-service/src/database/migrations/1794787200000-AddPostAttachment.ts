import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPostAttachment1794787200000 implements MigrationInterface {
  async up(runner: QueryRunner): Promise<void> {
    await runner.query('ALTER TABLE messages ADD COLUMN post_attachment jsonb NULL');
  }
  async down(runner: QueryRunner): Promise<void> {
    await runner.query('ALTER TABLE messages DROP COLUMN post_attachment');
  }
}
