import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import { Module } from "@nestjs/common";
import { MomentDatabase } from "./database.js";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: fileURLToPath(new URL("../.env", import.meta.url)),
    }),
  ],
  providers: [MomentDatabase],
})
class MigrationModule {}
const app = await NestFactory.createApplicationContext(MigrationModule, {
  logger: false,
});
try {
  if (!app.get(ConfigService).get("MOMENT_DATABASE_URL"))
    throw new Error("Configure MOMENT_DATABASE_URL");
  const client = await app.get(MomentDatabase).pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(1794614400)");
    await client.query(
      await readFile(
        new URL("../migrations/001-moments.sql", import.meta.url),
        "utf8",
      ),
    );
    await client.query("COMMIT");
    process.stdout.write("Moment schema migration applied\n");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
} finally {
  await app.close();
}
