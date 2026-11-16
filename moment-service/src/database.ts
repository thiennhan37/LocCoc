import { Injectable, OnModuleDestroy } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import pg from "pg";

@Injectable()
export class MomentDatabase implements OnModuleDestroy {
  readonly pool: pg.Pool;
  constructor(config: ConfigService) {
    this.pool = new pg.Pool({
      connectionString: config.getOrThrow<string>("MOMENT_DATABASE_URL"),
      max: 10,
      connectionTimeoutMillis: 2000,
      statement_timeout: 5000,
      idle_in_transaction_session_timeout: 15000,
    });
    this.pool.on("error", () => {
      /* no connection strings in logs */
    });
  }
  async onModuleDestroy() {
    await this.pool.end();
  }
}
