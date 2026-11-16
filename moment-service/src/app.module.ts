import { Controller, Get, Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { ConfigModule } from "@nestjs/config";
import { fileURLToPath } from "node:url";
import {
  Public,
  JwtAuthGuard,
  JwtVerifier,
  AccountAccessGuard,
  AccountAuthorityClient,
} from "@loccoc/common";
import { validateEnvironment } from "./environment.js";
import { MomentDatabase } from "./database.js";
import { MomentRepository } from "./moment.repository.js";
import { MomentStorage } from "./moment.storage.js";
import { AiClient } from "./ai.client.js";
import { MomentService } from "./moment.service.js";
import { MomentWorker } from "./moment.worker.js";
import { MomentController } from "./moment.controller.js";
import { MomentAccountEvents } from "./account-events.consumer.js";

@Controller("health")
class HealthController {
  constructor(
    private readonly db: MomentDatabase,
    private readonly storage: MomentStorage,
  ) {}
  @Public() @Get("live") live() {
    return { status: "live" };
  }
  @Get("ready") async ready() {
    const q = await this.db.pool.query(
      "SELECT version FROM moment_schema_migrations WHERE version=1",
    );
    if (!q.rowCount) throw new Error("Moment schema unavailable");
    await this.storage.assertPrivate();
    return { status: "ready" };
  }
}
@Module({
  controllers: [MomentController, HealthController],
  providers: [
    MomentDatabase,
    MomentRepository,
    MomentStorage,
    AiClient,
    MomentService,
    MomentWorker,
    MomentAccountEvents,
  ],
})
class RuntimeModule {}
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: fileURLToPath(new URL("../.env", import.meta.url)),
      validate: validateEnvironment,
    }),
    ...(process.env.MOMENTS_ENABLED === "true" ? [RuntimeModule] : []),
  ],
  providers: [
    JwtVerifier,
    AccountAuthorityClient,
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: AccountAccessGuard },
  ],
})
export class AppModule {}
