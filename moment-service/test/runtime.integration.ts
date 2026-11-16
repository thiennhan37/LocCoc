import "reflect-metadata";
import {
  randomBytes,
  randomUUID,
  generateKeyPairSync,
  createSign,
} from "node:crypto";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:http";
import { NestFactory } from "@nestjs/core";
import { ValidationPipe, type INestApplication } from "@nestjs/common";
import { json } from "express";
import request from "supertest";
import {
  S3Client,
  CreateBucketCommand,
  PutBucketPolicyCommand,
  DeleteBucketPolicyCommand,
} from "@aws-sdk/client-s3";
import sharp from "sharp";

// Import compiled production classes so Nest's constructor metadata is identical
// to deployment (Vitest/esbuild does not emit TypeScript decorator metadata).
const compiled = (path: string) => import(`../dist/${path}.js`);
let app: INestApplication;
let worker: { tick(): Promise<void> };
let repo: any;
let storage: any;
let authority: ReturnType<typeof createServer>;
let temp: string;
let s3: S3Client;
const owner = randomUUID(),
  other = randomUUID();
const inactive = new Set<string>();
const tokens = new Map<string, string>();
const bucket = process.env.MOMENTS_S3_BUCKET!;
const { privateKey, publicKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
});
function token(id: string) {
  const now = Math.floor(Date.now() / 1000);
  const h = Buffer.from(
    JSON.stringify({ alg: "RS256", typ: "JWT", kid: "loccoc-2026-01" }),
  ).toString("base64url");
  const p = Buffer.from(
    JSON.stringify({
      sub: id,
      role: "USER",
      sid: randomUUID(),
      iat: now,
      exp: now + 900,
      iss: "loccoc-auth",
      aud: "loccoc-api",
    }),
  ).toString("base64url");
  const value = `${h}.${p}.${createSign("RSA-SHA256").update(`${h}.${p}`).sign(privateKey).toString("base64url")}`;
  tokens.set(value, id);
  return value;
}
const a = token(owner),
  b = token(other);
const auth = (token = a) => ({ Authorization: `Bearer ${token}` });
const image = () =>
  sharp({ create: { width: 80, height: 40, channels: 3, background: "red" } })
    .jpeg()
    .toBuffer();
async function create(caption = "vuông đỏ", date = "2026-11-10T10:00:00Z") {
  const draft = await request(app.getHttpServer())
    .post("/moments")
    .set(auth())
    .send({ caption, capturedAt: date, place: "Đà Nẵng" })
    .expect(201);
  await request(app.getHttpServer())
    .put(`/moments/${draft.body.id}/image`)
    .set(auth())
    .set("content-type", "image/jpeg")
    .send(await image())
    .expect(200);
  return draft.body.id as string;
}

beforeAll(async () => {
  if (!process.env.MOMENT_DATABASE_URL?.includes("/moment_test"))
    throw new Error("Run via scripts/verify-moments.mjs only");
  temp = await mkdtemp(join(tmpdir(), "loccoc-moment-fixture-"));
  const pub = join(temp, "public.pem");
  await writeFile(pub, publicKey.export({ type: "spki", format: "pem" }));
  process.env.JWT_PUBLIC_KEY_PATH = pub;
  process.env.INTERNAL_SERVICE_TOKEN = randomBytes(32).toString("hex");
  authority = createServer((req, res) => {
    const id = tokens.get(
      (req.headers.authorization ?? "").replace("Bearer ", ""),
    );
    if (
      req.headers["x-service-token"] !== process.env.INTERNAL_SERVICE_TOKEN ||
      !id ||
      inactive.has(id)
    ) {
      res.writeHead(403);
      res.end();
      return;
    }
    res.setHeader("content-type", "application/json");
    res.end(
      JSON.stringify({
        user: { userId: id, role: "USER", roles: ["USER"], scopes: [] },
        account: { id, status: "active" },
      }),
    );
  });
  await new Promise<void>((r) => authority.listen(0, "127.0.0.1", r));
  process.env.AUTH_SERVICE_URL = `http://127.0.0.1:${(authority.address() as { port: number }).port}`;
  s3 = new S3Client({
    endpoint: process.env.MOMENTS_S3_ENDPOINT,
    region: "us-east-1",
    forcePathStyle: true,
    maxAttempts: 1,
    credentials: {
      accessKeyId: process.env.MOMENTS_S3_ACCESS_KEY!,
      secretAccessKey: process.env.MOMENTS_S3_SECRET_KEY!,
    },
  });
  await s3.send(new CreateBucketCommand({ Bucket: bucket }));
  const { AppModule } = await compiled("app.module");
  app = await NestFactory.create(AppModule, {
    logger: false,
    bodyParser: false,
  });
  app.use(json({ limit: "16kb" }));
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  await app.init();
  worker = app.get((await compiled("moment.worker")).MomentWorker);
  repo = app.get((await compiled("moment.repository")).MomentRepository);
  storage = app.get((await compiled("moment.storage")).MomentStorage);
}, 30000);

afterAll(async () => {
  await app?.close();
  await new Promise<void>((r) => authority?.close(() => r()));
  s3?.destroy();
  if (temp) await rm(temp, { recursive: true, force: true });
});

it("rejects unauthenticated, forged JWT, actor spoofing and owner fields", async () => {
  await request(app.getHttpServer())
    .post("/moments/search")
    .send({ query: "đỏ" })
    .expect(401);
  await request(app.getHttpServer())
    .post("/moments/search")
    .set(auth("forged.jwt.value"))
    .send({ query: "đỏ" })
    .expect(401);
  await request(app.getHttpServer())
    .post("/moments/search")
    .set(auth())
    .send({ query: "đỏ", ownerId: other })
    .expect(400);
  const id = await create();
  await request(app.getHttpServer())
    .get(`/moments/${id}`)
    .set({ ...auth(b), "x-user-id": owner })
    .expect(404);
  await request(app.getHttpServer())
    .delete(`/moments/${id}`)
    .set(auth(b))
    .expect(404);
  await request(app.getHttpServer())
    .get(`/moments/${id}/image`)
    .set(auth(b))
    .expect(404);
});

it("uploads/indexes/searches over real HTTP, PostgreSQL, private S3 and Qdrant", async () => {
  const id = await create();
  for (let i = 0; i < 6; i++) {
    await worker.tick();
    const m = await repo.get(owner, id);
    if (m.index_status === "ready") break;
  }
  expect((await repo.get(owner, id)).index_status).toBe("ready");
  const result = await request(app.getHttpServer())
    .post("/moments/search")
    .set(auth())
    .send({ query: "đỏ", place: "Đà Nẵng" })
    .expect(201);
  expect(result.body.mode).toBe("hybrid");
  expect(result.body.items.map((x: any) => x.id)).toContain(id);
  expect(JSON.stringify(result.body)).not.toContain("object_key");
  const bytes = await request(app.getHttpServer())
    .get(`/moments/${id}/image`)
    .set(auth())
    .expect(200);
  expect(bytes.headers["cache-control"]).toBe("private, no-store");
  const anon = await fetch(
    `${process.env.MOMENTS_S3_ENDPOINT}/${bucket}/${(await repo.get(owner, id)).object_key}`,
  );
  expect([401, 403]).toContain(anon.status);
  const list = await fetch(
    `${process.env.MOMENTS_S3_ENDPOINT}/${bucket}?list-type=2`,
  );
  expect([401, 403]).toContain(list.status);
  const write = await fetch(
    `${process.env.MOMENTS_S3_ENDPOINT}/${bucket}/anonymous-probe`,
    { method: "PUT", body: "synthetic" },
  );
  expect([401, 403]).toContain(write.status);
});

it("uses exact date filters and final ACL even with stale vector candidates", async () => {
  const id = await create("date-boundary", "2026-01-01T00:00:00Z");
  for (let i = 0; i < 6; i++) await worker.tick();
  const results = await request(app.getHttpServer())
    .post("/moments/search")
    .set(auth())
    .send({ query: "đỏ", dateFrom: "2026-01-02T00:00:00Z" })
    .expect(201);
  expect(results.body.items.map((x: any) => x.id)).not.toContain(id);
  await request(app.getHttpServer())
    .delete(`/moments/${id}`)
    .set(auth())
    .expect(200);
  await request(app.getHttpServer())
    .get(`/moments/${id}/image`)
    .set(auth())
    .expect(404);
  const after = await request(app.getHttpServer())
    .post("/moments/search")
    .set(auth())
    .send({ query: "đỏ" })
    .expect(201);
  expect(after.body.items.map((x: any) => x.id)).not.toContain(id);
  await worker.tick();
});

it("returns explicit metadata fallback and semantic-required failure on provider outage", async () => {
  const id = await create("outage");
  const fallback = await request(app.getHttpServer())
    .post("/moments/search")
    .set(auth())
    .send({ query: "outage" })
    .expect(201);
  expect(fallback.body.mode).toBe("metadata_only");
  expect(fallback.body.items.map((x: any) => x.id)).toContain(id);
  await request(app.getHttpServer())
    .post("/moments/search")
    .set(auth())
    .send({ query: "outage", requireSemantic: true })
    .expect(503);
});

it("prevents revoked/suspended/deleted accounts from reading stored images", async () => {
  const id = await create();
  inactive.add(owner);
  try {
    await request(app.getHttpServer())
      .get(`/moments/${id}/image`)
      .set(auth())
      .expect(403);
  } finally {
    inactive.delete(owner);
  }
});

it("claims jobs exclusively, rejects stale lease completion and retains retries", async () => {
  const id = await create();
  await repo.db.pool.query(
    "UPDATE moment_jobs SET status='done' WHERE moment_id<>$1",
    [id],
  );
  const [one, two] = await Promise.all([repo.claim(), repo.claim()]);
  const claimed = one ?? two;
  expect(claimed).toBeDefined();
  expect(one && two).toBeFalsy();
  const replacement = randomUUID();
  await repo.db.pool.query("UPDATE moment_jobs SET lease=$2 WHERE id=$1", [
    claimed.job_id,
    replacement,
  ]);
  expect(await repo.complete(claimed)).toBe(false);
  expect((await repo.get(owner, id)).index_status).toBe("pending");
  await repo.fail({ ...claimed, lease: replacement }, "PROVIDER_TIMEOUT");
  const q = await repo.db.pool.query(
    "SELECT status,error_code FROM moment_jobs WHERE id=$1",
    [claimed.job_id],
  );
  expect(q.rows[0]).toMatchObject({
    status: "pending",
    error_code: "PROVIDER_TIMEOUT",
  });
});

it("detects a public bucket policy and recovers after policy removal", async () => {
  await s3.send(
    new PutBucketPolicyCommand({
      Bucket: bucket,
      Policy: JSON.stringify({
        Version: "2012-10-17",
        Statement: [
          {
            Effect: "Allow",
            Principal: "*",
            Action: "s3:GetObject",
            Resource: `arn:aws:s3:::${bucket}/*`,
          },
        ],
      }),
    }),
  );
  await expect(storage.assertPrivate()).rejects.toThrow();
  await s3.send(new DeleteBucketPolicyCommand({ Bucket: bucket }));
  await expect(storage.assertPrivate()).resolves.toBeUndefined();
});

it("pages without losing records or permitting cursor tenant changes", async () => {
  const first = await request(app.getHttpServer())
    .get("/moments?limit=1")
    .set(auth())
    .expect(200);
  expect(first.body.items).toHaveLength(1);
  expect(first.body.nextCursor).toBeTruthy();
  const second = await request(app.getHttpServer())
    .get(`/moments?limit=1&cursor=${first.body.nextCursor}`)
    .set(auth())
    .expect(200);
  expect(second.body.items[0].id).not.toBe(first.body.items[0].id);
  const others = await request(app.getHttpServer())
    .get(`/moments?cursor=${first.body.nextCursor}`)
    .set(auth(b))
    .expect(200);
  expect(others.body.items).toEqual([]);
});

it("account deletion tombstones all records and replay cannot revive them", async () => {
  const doomed = randomUUID();
  const row = await repo.create(doomed, {
    caption: "private",
    tags: [],
    place: "secret",
  });
  await repo.deleteAccount(doomed, 4);
  await repo.deleteAccount(doomed, 3);
  const q = await repo.db.pool.query(
    "SELECT state,caption,place FROM moments WHERE id=$1",
    [row.id],
  );
  expect(q.rows[0]).toMatchObject({
    state: "deleted",
    caption: "",
    place: null,
  });
  await expect(
    repo.create(doomed, { caption: "revive", tags: [] }),
  ).rejects.toThrow();
});

it("job failure honors upstream retry delay and manual retry resets failed work", async () => {
  const id = await create("retry case");
  await repo.db.pool.query(
    "UPDATE moment_jobs SET status='done' WHERE moment_id<>$1",
    [id],
  );
  const job = await repo.claim();
  expect(job.id).toBe(id);
  await repo.fail(job, "PROVIDER_RATE_LIMITED", false, 120);
  const delay = await repo.db.pool.query(
    "SELECT extract(epoch FROM available_at-now()) AS seconds FROM moment_jobs WHERE id=$1",
    [job.job_id],
  );
  expect(Number(delay.rows[0].seconds)).toBeGreaterThan(115);
  await repo.db.pool.query(
    "UPDATE moment_jobs SET status='failed' WHERE id=$1",
    [job.job_id],
  );
  await repo.db.pool.query(
    "UPDATE moments SET index_status='failed' WHERE id=$1",
    [id],
  );
  await request(app.getHttpServer())
    .post(`/moments/${id}/retry-index`)
    .set(auth())
    .send({})
    .expect(201);
  const ready = await repo.db.pool.query(
    "SELECT status,attempts FROM moment_jobs WHERE id=$1",
    [job.job_id],
  );
  expect(ready.rows[0]).toMatchObject({ status: "pending", attempts: 0 });
});
