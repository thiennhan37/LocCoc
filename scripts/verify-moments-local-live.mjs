// Explicit live check of the configured LOCAL deployment. Synthetic fixture only.
// At most two additional provider reservations; no legacy Gemini key is read by AI.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { parseEnv } from "node:util";
import { createRequire } from "node:module";
import { randomUUID, randomBytes } from "node:crypto";
import { resolve } from "node:path";
import assert from "node:assert/strict";
if (!process.argv.includes("--live"))
  throw new Error("Explicit --live authorization required");
const root = resolve(import.meta.dirname, "..");
const read = (file) => parseEnv(readFileSync(resolve(root, file), "utf8"));
const common = read(".env"),
  auth = { ...common, ...read("auth-service/.env") },
  moment = read("moment-service/.env");
const authRequire = createRequire(
  new URL("../auth-service/package.json", import.meta.url),
);
const momentRequire = createRequire(
  new URL("../moment-service/package.json", import.meta.url),
);
const { Client } = authRequire("pg");
const Redis = authRequire("ioredis");
const argon2 = authRequire("argon2"),
  sharp = momentRequire("sharp");
const gateway = `http://127.0.0.1:${common.GATEWAY_PORT || 8080}`;
const authOrigin = moment.AUTH_SERVICE_URL;
for (const origin of [gateway, authOrigin, moment.AI_SERVICE_URL])
  assert(
    ["127.0.0.1", "localhost"].includes(new URL(origin).hostname),
    "Local endpoints only",
  );
const db = new Client({
  host: auth.DB_HOST || "127.0.0.1",
  port: Number(auth.DB_PORT || 5433),
  user: auth.AUTH_DB_USER,
  password: auth.AUTH_DB_PASSWORD,
  database: auth.AUTH_DB_NAME || "accounts",
  connectionTimeoutMillis: 3000,
});
const momentDb = new Client({
  connectionString: moment.MOMENT_DATABASE_URL,
  connectionTimeoutMillis: 3000,
});
const redis = new Redis(common.REDIS_URL, {
  lazyConnect: true,
  maxRetriesPerRequest: 1,
  connectTimeout: 2000,
});
const runId = randomUUID(),
  owners = [randomUUID(), randomUUID()],
  tokens = [];
const report = {
  runId,
  startedAt: new Date().toISOString(),
  gateway,
  fixture: "synthetic-red-square",
  keyField: "GEMINI_EMBEDDING_API_KEY",
  maxProviderReservations: 2,
  checks: [],
  passed: false,
};
const mark = (name) => {
  report.checks.push(name);
  process.stdout.write(`PASS: ${name}\n`);
};
let imageId,
  baseline = 0;
const dayKey = () =>
  `moments:gemini:day:${new Date().toISOString().slice(0, 10).replaceAll("-", "")}`;
const used = async () => Number((await redis.get(dayKey())) || 0) - baseline;
async function api(method, path, token, body, expected = 200, headers = {}) {
  const binary = Buffer.isBuffer(body);
  const r = await fetch(gateway + path, {
    method,
    signal: AbortSignal.timeout(12000),
    redirect: "error",
    headers: {
      ...(token
        ? { authorization: `Bearer ${token}` }
        : { accept: "application/json" }),
      ...(body
        ? { "content-type": binary ? "image/jpeg" : "application/json" }
        : {}),
      ...headers,
    },
    body: body
      ? binary
        ? new Uint8Array(body)
        : JSON.stringify(body)
      : undefined,
  });
  assert.equal(
    r.status,
    expected,
    `${method} ${path}: unexpected HTTP status ${r.status}`,
  );
  if (r.headers.get("content-type")?.startsWith("image/"))
    return Buffer.from(await r.arrayBuffer());
  return r.json();
}
try {
  await db.connect();
  await momentDb.connect();
  await redis.connect();
  baseline = Number((await redis.get(dayKey())) || 0);
  const password = randomBytes(24).toString("base64url");
  const hash = await argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1,
  });
  for (const owner of owners) {
    const email = `moments-live-${owner}@example.invalid`;
    // Only newly generated fixture IDs are written; no existing account is altered.
    await db.query(
      "INSERT INTO accounts(id,email,password_hash,role,status,email_verified_at) VALUES($1,$2,$3,'user','active',now())",
      [owner, email, hash],
    );
    const login = await api("POST", "/auth/login", undefined, {
      email,
      password,
    });
    assert.equal(typeof login.accessToken, "string");
    tokens.push(login.accessToken);
  }
  mark("real AuthService login and JWT sessions for two synthetic accounts");
  await api("POST", "/moments/search", undefined, { query: "ảnh" }, 401);
  await api(
    "POST",
    "/moments/search",
    tokens[0],
    { query: "ảnh", ownerId: owners[1] },
    400,
  );
  mark("gateway rejects missing auth and client-supplied ownership");
  const draft = await api(
    "POST",
    "/moments",
    tokens[0],
    {
      caption: `synthetic-${runId}`,
      tags: [],
      capturedAt: new Date().toISOString(),
      place: "fixture-zone",
    },
    201,
  );
  imageId = draft.id;
  const bytes = await sharp({
    create: { width: 256, height: 256, channels: 3, background: "white" },
  })
    .composite([
      {
        input: Buffer.from(
          '<svg width="176" height="176"><rect width="176" height="176" fill="red"/></svg>',
        ),
        left: 40,
        top: 40,
      },
    ])
    .jpeg()
    .toBuffer();
  const upload = await api(
    "PUT",
    `/moments/${imageId}/image`,
    tokens[0],
    bytes,
  );
  assert.equal(upload.state, "active");
  mark("private upload commits active image and pending durable job");
  await api("GET", `/moments/${imageId}/image`, tokens[1], undefined, 404);
  await api("DELETE", `/moments/${imageId}`, tokens[1], undefined, 404);
  mark("second account cannot read or delete the first account image");
  let indexed = false;
  for (let attempt = 0; attempt < 30; attempt++) {
    const current = await api("GET", `/moments/${imageId}`, tokens[0]);
    if (current.indexStatus === "ready") {
      indexed = true;
      break;
    }
    if (current.indexStatus === "failed")
      throw new Error("Live indexing failed");
    if ((await used()) >= 2)
      throw new Error(
        "Live verification provider budget reached; stopping fixture work",
      );
    await new Promise((r) => setTimeout(r, 750));
  }
  assert(indexed, "Index did not become ready within the bounded wait");
  mark("real Gemini image embedding indexed by background worker");
  assert((await used()) < 2, "No live request budget left for semantic search");
  const result = await api(
    "POST",
    "/moments/search",
    tokens[0],
    {
      query: "một hình vuông màu đỏ trên nền trắng",
      requireSemantic: true,
      limit: 5,
    },
    201,
  );
  assert.equal(result.mode, "hybrid");
  assert.equal(result.semanticStatus, "available");
  assert(
    result.items.some((x) => x.id === imageId),
    "Vector branch did not retrieve the synthetic fixture",
  );
  mark(
    "real Gemini Vietnamese query retrieves image through gateway and final ACL",
  );
  const download = await api("GET", `/moments/${imageId}/image`, tokens[0]);
  assert(download.length > 0);
  mark("authenticated image read succeeds for owner");
  await api("DELETE", `/moments/${imageId}`, tokens[0]);
  await api("GET", `/moments/${imageId}/image`, tokens[0], undefined, 404);
  let cleaned = false;
  for (let i = 0; i < 20; i++) {
    const q = await momentDb.query(
      "SELECT status FROM moment_jobs WHERE moment_id=$1 AND operation='delete'",
      [imageId],
    );
    if (q.rows[0]?.status === "done") {
      cleaned = true;
      break;
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  assert(cleaned, "External deletion cleanup did not finish");
  mark(
    "deletion immediately revokes access and durable external cleanup finishes",
  );
  report.passed = true;
} catch (error) {
  report.error =
    error instanceof Error
      ? error.message.replace(/https?:\/\/\S+/g, "[origin]")
      : "Verification failed";
  process.stderr.write(`FAIL: ${report.error}\n`);
  process.exitCode = 1;
} finally {
  // Tombstone only this run's fixture. Never retry embedding or delete real data.
  if (imageId && tokens[0])
    await api("DELETE", `/moments/${imageId}`, tokens[0]).catch(() => {});
  for (let i = 0; i < tokens.length; i++) {
    try {
      const r = await fetch(
        `${authOrigin}/internal/accounts/${owners[i]}/delete`,
        {
          method: "POST",
          signal: AbortSignal.timeout(5000),
          headers: {
            authorization: `Bearer ${tokens[i]}`,
            "x-service-token": auth.INTERNAL_SERVICE_TOKEN,
          },
        },
      );
      if (!r.ok) report.fixtureCleanupPending = true;
    } catch {
      report.fixtureCleanupPending = true;
    }
  }
  report.additionalProviderReservations = await used().catch(() => null);
  report.completedAt = new Date().toISOString();
  const dir = resolve(root, "logs/moments-local");
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    resolve(dir, `live-verification-${runId}.json`),
    JSON.stringify(report, null, 2),
  );
  process.stdout.write(
    `Provider reservations this run: ${report.additionalProviderReservations}; report saved under logs/moments-local.\n`,
  );
  await redis.quit().catch(() => {});
  await db.end().catch(() => {});
  await momentDb.end().catch(() => {});
}
