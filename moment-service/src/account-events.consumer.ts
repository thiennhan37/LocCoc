import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Kafka, logLevel, type Consumer } from "kafkajs";
import { isUUID } from "class-validator";
import { MomentRepository } from "./moment.repository.js";

@Injectable()
export class MomentAccountEvents implements OnModuleInit, OnModuleDestroy {
  private consumer?: Consumer;
  private timer?: ReturnType<typeof setTimeout>;
  private stopped = false;
  private running?: Promise<void>;
  constructor(
    private readonly repo: MomentRepository,
    private readonly config: ConfigService,
  ) {}
  async apply(event: unknown) {
    const e = event as {
      eventType?: string;
      aggregateId?: string;
      version?: number;
      data?: { id?: string; version?: number; status?: string };
    } | null;
    if (
      e?.eventType !== "ACCOUNT_CHANGED" ||
      !isUUID(e.data?.id) ||
      e.aggregateId !== e.data?.id ||
      !Number.isSafeInteger(e.version) ||
      !e.version ||
      e.version < 1 ||
      e.data?.version !== e.version ||
      !["active", "suspended", "pending_verification", "deleted"].includes(
        e.data?.status ?? "",
      )
    )
      throw new Error("Invalid account event");
    if (e.data!.status === "deleted")
      await this.repo.deleteAccount(e.data!.id!, e.version);
  }
  onModuleInit() {
    if (this.config.get("NODE_ENV") !== "test") this.schedule();
  }
  private schedule() {
    if (this.stopped) return;
    this.timer = setTimeout(() => {
      this.running = this.start().catch(() => this.schedule());
    }, 2000);
    this.timer.unref();
  }
  private async start() {
    const consumer = new Kafka({
      clientId: "moment-service",
      brokers: this.config
        .get<string>("KAFKA_BROKERS", "127.0.0.1:9092")
        .split(","),
      retry: { retries: 2 },
      logLevel: logLevel.NOTHING,
    }).consumer({
      groupId: this.config.get<string>(
        "MOMENT_ACCOUNT_CONSUMER_GROUP",
        "moment-service-accounts-v1",
      ),
    });
    try {
      await consumer.connect();
      await consumer.subscribe({
        topic: this.config.get<string>(
          "ACCOUNT_EVENTS_TOPIC",
          "account.events",
        ),
        fromBeginning: true,
      });
      await consumer.run({
        eachMessage: async ({ message }) => {
          await this.apply(JSON.parse(message.value?.toString() ?? "null"));
        },
      });
      this.consumer = consumer;
    } catch {
      await consumer.disconnect();
      throw new Error("Account event dependency unavailable");
    }
  }
  async onModuleDestroy() {
    this.stopped = true;
    clearTimeout(this.timer);
    await this.running;
    await this.consumer?.disconnect();
  }
}
