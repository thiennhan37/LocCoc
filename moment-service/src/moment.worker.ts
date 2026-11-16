import { createHash } from "node:crypto";
import { Injectable, OnModuleInit, OnModuleDestroy } from "@nestjs/common";
import { MomentRepository } from "./moment.repository.js";
import { MomentStorage } from "./moment.storage.js";
import { AiClient, AiError } from "./ai.client.js";

@Injectable()
export class MomentWorker implements OnModuleInit, OnModuleDestroy {
  private timer?: ReturnType<typeof setTimeout>;
  private stopping = false;
  private running?: Promise<void>;
  constructor(
    private readonly repo: MomentRepository,
    private readonly storage: MomentStorage,
    private readonly ai: AiClient,
  ) {}
  onModuleInit() {
    if (process.env.NODE_ENV !== "test") this.schedule();
  }
  private schedule() {
    if (this.stopping) return;
    this.timer = setTimeout(() => {
      this.running = this.tick()
        .catch(() => {
          /* next poll retries; no credentials logged */
        })
        .finally(() => this.schedule());
    }, 1000);
    this.timer.unref();
  }
  async tick() {
    await this.cleanupStaging();
    if (!this.ai.enabled) {
      // Storage erasure must continue in metadata-only mode. Keep vector cleanup
      // jobs pending until AI is enabled again; do not consume their attempts.
      const deleted = await this.repo.db.pool.query(
        "SELECT id,object_key FROM moments WHERE state='deleted' AND object_key IS NOT NULL LIMIT 10",
      );
      for (const row of deleted.rows) {
        await this.storage.remove(row.object_key);
        await this.repo.db.pool.query(
          "UPDATE moments SET object_key=NULL WHERE id=$1 AND state='deleted' AND object_key=$2",
          [row.id, row.object_key],
        );
      }
      return;
    }
    const job = await this.repo.claim();
    if (!job) return;
    // Cross-process lock serializes vector writes/deletes for one moment. Never
    // hold a DB transaction across provider calls; lease+CAS survive crashes.
    const lock = await this.repo.db.pool.connect();
    let locked = false;
    try {
      const q = await lock.query(
        "SELECT pg_try_advisory_lock(hashtextextended($1,1)) AS locked",
        [job.id],
      );
      locked = q.rows[0].locked;
      if (!locked) throw new AiError("ASSET_BUSY");
      const owned = await lock.query(
        "SELECT 1 FROM moment_jobs WHERE id=$1 AND lease=$2 AND status='running' AND lease_until>now()",
        [job.job_id, job.lease],
      );
      if (!owned.rowCount) return;
      const current = await lock.query("SELECT * FROM moments WHERE id=$1", [
        job.id,
      ]);
      const row = current.rows[0];
      if (job.operation === "delete" || row.state === "deleted") {
        if (job.object_key) await this.storage.remove(job.object_key);
        await this.ai.remove(job.owner_id, job.asset_id);
        await this.repo.complete(job);
        return;
      }
      if (row.state !== "active" || row.asset_version !== job.asset_version) {
        await this.repo.complete(job);
        return;
      }
      const bytes = await this.storage.get(row.object_key);
      if (createHash("sha256").update(bytes).digest("hex") !== row.checksum)
        throw new AiError("ASSET_CHECKSUM_MISMATCH", true);
      await this.ai.index(
        job.owner_id,
        job.asset_id,
        job.asset_version,
        bytes,
        {
          capturedAt: row.captured_at.toISOString(),
          albumId: row.album_id,
          place: row.place,
        },
      );
      if (!(await this.repo.complete(job))) {
        // Delete only under the same asset lock. A later index lease will rebuild.
        await this.ai.remove(job.owner_id, job.asset_id);
      }
    } catch (e) {
      await this.repo.fail(
        job,
        e instanceof AiError ? e.code : "INDEX_DEPENDENCY_UNAVAILABLE",
        e instanceof AiError && e.permanent,
        e instanceof AiError ? e.retryAfter : 0,
      );
    } finally {
      if (locked)
        await lock.query("SELECT pg_advisory_unlock(hashtextextended($1,1))", [
          job.id,
        ]);
      lock.release();
    }
  }
  private async cleanupStaging() {
    // Two workers may remove the same orphan; object deletion is idempotent.
    const q = await this.repo.db.pool
      .query(`SELECT object_key FROM moment_staged_objects s WHERE created_at<now()-interval '1 hour'
      AND NOT EXISTS(SELECT 1 FROM moments m WHERE m.object_key=s.object_key AND m.state='active') LIMIT 10`);
    for (const row of q.rows) {
      try {
        await this.storage.remove(row.object_key);
        await this.repo.db.pool.query(
          "DELETE FROM moment_staged_objects WHERE object_key=$1",
          [row.object_key],
        );
      } catch {
        /* Keep the ledger entry for a later cleanup; do not poison indexing. */
      }
    }
    await this.repo.db.pool.query(
      "DELETE FROM moment_upload_limits WHERE hour<now()-interval '2 days'",
    );
  }
  async onModuleDestroy() {
    this.stopping = true;
    clearTimeout(this.timer);
    await this.running;
  }
}
