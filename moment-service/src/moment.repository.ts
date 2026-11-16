import { randomUUID } from "node:crypto";
import {
  Injectable,
  NotFoundException,
  ConflictException,
  HttpException,
  BadRequestException,
} from "@nestjs/common";
import type pg from "pg";
import { ConfigService } from "@nestjs/config";
import { MomentDatabase } from "./database.js";
import type {
  CreateMomentDto,
  SearchMomentsDto,
  ListMomentsDto,
} from "./moment.dto.js";

export interface MomentRow {
  id: string;
  owner_id: string;
  asset_id: string;
  asset_version: number;
  state: "draft" | "active" | "deleted";
  caption: string;
  tags: string[];
  captured_at: Date;
  album_id: string | null;
  place: string | null;
  object_key: string | null;
  checksum: string | null;
  index_status: "pending" | "ready" | "failed";
}
export interface JobRow extends MomentRow {
  job_id: string;
  operation: "index" | "delete" | "object_cleanup";
  attempts: number;
  lease: string;
}

export function filterSql(
  owner: string,
  f: Partial<SearchMomentsDto>,
  args: unknown[],
) {
  const add = (v: unknown) => {
    args.push(v);
    return `$${args.length}`;
  };
  const clauses = [`owner_id=${add(owner)}::uuid`, "state='active'"];
  if (f.albumId) clauses.push(`album_id=${add(f.albumId)}::uuid`);
  if (f.place) clauses.push(`lower(place)=lower(${add(f.place)})`);
  if (f.dateFrom) clauses.push(`captured_at>=${add(f.dateFrom)}::timestamptz`);
  if (f.dateTo) clauses.push(`captured_at<=${add(f.dateTo)}::timestamptz`);
  return clauses.join(" AND ");
}

@Injectable()
export class MomentRepository {
  constructor(
    readonly db: MomentDatabase,
    private readonly config: ConfigService,
  ) {}
  private async transaction<T>(work: (client: pg.PoolClient) => Promise<T>) {
    const client = await this.db.pool.connect();
    try {
      await client.query("BEGIN");
      const result = await work(client);
      await client.query("COMMIT");
      return result;
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
  }
  async create(owner: string, dto: CreateMomentDto): Promise<MomentRow> {
    return this.transaction(async (c) => {
      await c.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
        owner,
      ]);
      if (
        (
          await c.query(
            "SELECT 1 FROM moment_deleted_accounts WHERE owner_id=$1",
            [owner],
          )
        ).rowCount
      )
        throw new NotFoundException();
      const count = await c.query(
        "SELECT count(*)::int AS n FROM moments WHERE owner_id=$1 AND state <> 'deleted'",
        [owner],
      );
      if (
        count.rows[0].n >=
        this.config.get<number>("MOMENTS_MAX_PER_OWNER", 1000)
      )
        throw new HttpException("Moment quota exceeded", 429);
      const q = await c.query<MomentRow>(
        `INSERT INTO moments(id,owner_id,asset_id,caption,tags,captured_at,album_id,place)
        VALUES($1,$2,$3,$4,$5,coalesce($6::timestamptz,now()),$7,$8) RETURNING *`,
        [
          randomUUID(),
          owner,
          randomUUID(),
          dto.caption,
          dto.tags.map((s) => s.normalize("NFC").trim()),
          dto.capturedAt,
          dto.albumId,
          dto.place,
        ],
      );
      return q.rows[0];
    });
  }
  async get(
    owner: string,
    id: string,
    includeDraft = false,
  ): Promise<MomentRow> {
    const q = await this.db.pool.query<MomentRow>(
      `SELECT * FROM moments WHERE id=$1 AND owner_id=$2 AND state = ANY($3)`,
      [id, owner, includeDraft ? ["draft", "active"] : ["active"]],
    );
    if (!q.rows[0]) throw new NotFoundException();
    return q.rows[0];
  }
  async stage(key: string, owner: string) {
    await this.transaction(async (c) => {
      const quota = await c.query(
        `INSERT INTO moment_upload_limits(owner_id,hour,used) VALUES($1,date_trunc('hour',now()),1)
        ON CONFLICT(owner_id,hour) DO UPDATE SET used=moment_upload_limits.used+1
        WHERE moment_upload_limits.used < $2 RETURNING used`,
        [owner, this.config.get<number>("MOMENTS_UPLOADS_PER_HOUR", 30)],
      );
      if (!quota.rowCount)
        throw new HttpException("Upload quota exceeded", 429);
      await c.query(
        "INSERT INTO moment_staged_objects(object_key) VALUES($1)",
        [key],
      );
    });
  }
  async activate(
    owner: string,
    id: string,
    key: string,
    checksum: string,
  ): Promise<MomentRow> {
    return this.transaction(async (c) => {
      const q = await c.query<MomentRow>(
        `UPDATE moments SET state='active', object_key=$3, checksum=$4, updated_at=now()
        WHERE id=$1 AND owner_id=$2 AND state='draft' RETURNING *`,
        [id, owner, key, checksum],
      );
      if (!q.rows[0])
        throw new ConflictException("Moment is already uploaded or deleted");
      const row = q.rows[0];
      await c.query(
        `INSERT INTO moment_jobs(id,moment_id,operation,asset_version) VALUES($1,$2,'index',$3)`,
        [randomUUID(), id, row.asset_version],
      );
      await c.query("DELETE FROM moment_staged_objects WHERE object_key=$1", [
        key,
      ]);
      return row;
    });
  }
  async remove(owner: string, id: string) {
    return this.transaction(async (c) => {
      const q = await c.query<MomentRow>(
        "UPDATE moments SET state='deleted',caption='',tags='{}',place=NULL,album_id=NULL,updated_at=now() WHERE id=$1 AND owner_id=$2 RETURNING *",
        [id, owner],
      );
      if (!q.rows[0]) throw new NotFoundException();
      await c.query(
        `INSERT INTO moment_jobs(id,moment_id,operation,asset_version) VALUES($1,$2,'delete',$3) ON CONFLICT DO NOTHING`,
        [randomUUID(), id, q.rows[0].asset_version],
      );
    });
  }
  async retry(owner: string, id: string) {
    return this.transaction(async (c) => {
      const q = await c.query(
        `UPDATE moments SET index_status='pending',updated_at=now()
        WHERE id=$1 AND owner_id=$2 AND state='active' AND index_status='failed' RETURNING id`,
        [id, owner],
      );
      if (!q.rowCount) throw new ConflictException("Moment cannot be retried");
      await c.query(
        `UPDATE moment_jobs SET status='pending',attempts=0,error_code=NULL,available_at=now(),lease=NULL,lease_until=NULL
        WHERE moment_id=$1 AND operation='index' AND status='failed'`,
        [id],
      );
    });
  }
  async deleteAccount(owner: string, version: number) {
    await this.transaction(async (c) => {
      // Account deletion is terminal. Old active/replayed messages never revive data.
      await c.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
        owner,
      ]);
      const accepted = await c.query(
        `INSERT INTO moment_deleted_accounts(owner_id,version) VALUES($1,$2)
        ON CONFLICT(owner_id) DO UPDATE SET version=EXCLUDED.version WHERE moment_deleted_accounts.version<EXCLUDED.version RETURNING owner_id`,
        [owner, version],
      );
      if (!accepted.rowCount) return;
      await c.query(
        "UPDATE moments SET state='deleted',caption='',tags='{}',place=NULL,album_id=NULL,updated_at=now() WHERE owner_id=$1",
        [owner],
      );
      await c.query(
        `INSERT INTO moment_jobs(id,moment_id,operation,asset_version)
        SELECT gen_random_uuid(),id,'delete',asset_version FROM moments WHERE owner_id=$1 ON CONFLICT DO NOTHING`,
        [owner],
      );
    });
  }
  async metadata(
    owner: string,
    f: Partial<SearchMomentsDto>,
    query?: string,
  ): Promise<MomentRow[]> {
    const args: unknown[] = [];
    let where = filterSql(owner, f, args);
    if (query) {
      args.push(query);
      where += ` AND to_tsvector('simple',caption || ' ' || array_to_string(tags,' ') || ' ' || coalesce(place,'')) @@ plainto_tsquery('simple',$${args.length})`;
    }
    return (
      await this.db.pool.query<MomentRow>(
        `SELECT * FROM moments WHERE ${where} ORDER BY captured_at DESC,id DESC LIMIT 200`,
        args,
      )
    ).rows;
  }
  async list(owner: string, dto: ListMomentsDto) {
    const args: unknown[] = [owner];
    let after = "";
    if (dto.cursor) {
      try {
        const c = JSON.parse(
          Buffer.from(dto.cursor, "base64url").toString("utf8"),
        ) as { date: string; id: string };
        if (
          !c ||
          !/^\d{4}-\d{2}-\d{2}T/.test(c.date) ||
          !Number.isFinite(Date.parse(c.date)) ||
          !/^[0-9a-f-]{36}$/.test(c.id)
        )
          throw new Error();
        args.push(c.date, c.id);
        after = " AND (captured_at,id)<($2::timestamptz,$3::uuid)";
      } catch {
        throw new BadRequestException("Invalid cursor");
      }
    }
    args.push(dto.limit + 1);
    const q = await this.db.pool.query<MomentRow>(
      `SELECT * FROM moments WHERE owner_id=$1 AND state IN ('active','draft')${after}
      ORDER BY captured_at DESC,id DESC LIMIT $${args.length}`,
      args,
    );
    const items = q.rows.slice(0, dto.limit);
    const last = items.at(-1);
    return {
      items,
      nextCursor:
        q.rows.length > dto.limit && last
          ? Buffer.from(
              JSON.stringify({
                date: last.captured_at.toISOString(),
                id: last.id,
              }),
            ).toString("base64url")
          : null,
    };
  }
  async hydrate(
    owner: string,
    f: Partial<SearchMomentsDto>,
    assets: string[],
  ): Promise<MomentRow[]> {
    if (!assets.length) return [];
    const args: unknown[] = [];
    const where = filterSql(owner, f, args);
    args.push(assets);
    return (
      await this.db.pool.query<MomentRow>(
        `SELECT * FROM moments WHERE ${where} AND asset_id=ANY($${args.length}::uuid[])`,
        args,
      )
    ).rows;
  }
  async claim(): Promise<JobRow | undefined> {
    return this.transaction(async (c) => {
      // Recover exhausted leases explicitly rather than leaving permanent running jobs.
      await c.query(`WITH exhausted AS (UPDATE moment_jobs SET status='failed',error_code='WORKER_LEASE_EXHAUSTED'
        WHERE status='running' AND lease_until<now() AND attempts>=5 RETURNING moment_id,operation)
        UPDATE moments SET index_status='failed' WHERE id IN (SELECT moment_id FROM exhausted WHERE operation='index') AND state='active'`);
      const q = await c.query(`SELECT id FROM moment_jobs WHERE attempts<5 AND
        ((status='pending' AND available_at<=now()) OR (status='running' AND lease_until<now()))
        ORDER BY CASE WHEN operation='delete' THEN 0 ELSE 1 END, available_at FOR UPDATE SKIP LOCKED LIMIT 1`);
      if (!q.rows[0]) return undefined;
      const lease = randomUUID();
      const job = await c.query(
        `UPDATE moment_jobs SET status='running',attempts=attempts+1,lease=$2,
        lease_until=now()+interval '60 seconds' WHERE id=$1 RETURNING *`,
        [q.rows[0].id, lease],
      );
      const j = job.rows[0];
      const moment = await c.query<MomentRow>(
        "SELECT * FROM moments WHERE id=$1",
        [j.moment_id],
      );
      return {
        ...moment.rows[0],
        job_id: j.id,
        operation: j.operation,
        attempts: j.attempts,
        lease,
        asset_version: j.asset_version,
      } as JobRow;
    });
  }
  async complete(job: JobRow) {
    return this.transaction(async (c) => {
      const q = await c.query(
        `UPDATE moment_jobs SET status='done',lease_until=NULL,error_code=NULL WHERE id=$1 AND lease=$2 AND status='running' AND lease_until>now() RETURNING id`,
        [job.job_id, job.lease],
      );
      if (!q.rowCount) return false;
      if (job.operation === "index") {
        const active = await c.query(
          `UPDATE moments SET index_status='ready' WHERE id=$1 AND state='active' AND asset_version=$2 RETURNING id`,
          [job.id, job.asset_version],
        );
        return !!active.rowCount;
      }
      await c.query(
        "UPDATE moments SET object_key=NULL,checksum=NULL WHERE id=$1 AND state='deleted'",
        [job.id],
      );
      return true;
    });
  }
  async fail(job: JobRow, code: string, permanent = false, retryAfter = 0) {
    await this.transaction(async (c) => {
      const q = await c.query(
        `UPDATE moment_jobs SET status=$3,error_code=$4,lease_until=NULL,
        available_at=now()+($5::int * interval '1 second') WHERE id=$1 AND lease=$2 AND status='running' RETURNING id`,
        [
          job.job_id,
          job.lease,
          permanent || job.attempts >= 5 ? "failed" : "pending",
          code,
          Math.max(
            retryAfter,
            Math.min(300, 2 ** job.attempts * 5) +
              Math.floor(Math.random() * 10),
          ),
        ],
      );
      if (
        q.rowCount &&
        job.operation === "index" &&
        (permanent || job.attempts >= 5)
      )
        await c.query(
          "UPDATE moments SET index_status='failed' WHERE id=$1 AND state='active' AND asset_version=$2",
          [job.id, job.asset_version],
        );
    });
  }
}
