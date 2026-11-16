// Preview by default. --apply provisions additive LOCAL development resources and
// writes only the two ignored service env files; never rotates existing secrets.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { parseEnv } from "node:util";
import { createRequire } from "node:module";
import { randomBytes } from "node:crypto";
import { resolve } from "node:path";
import { execFileSync } from "node:child_process";
const root = resolve(import.meta.dirname, "..");
const read = (file) =>
  existsSync(resolve(root, file))
    ? parseEnv(readFileSync(resolve(root, file), "utf8"))
    : {};
const common = read(".env"),
  auth = { ...common, ...read("auth-service/.env") };
const media = { ...common, ...read("user-service/.env") };
const ai = read("ai-service/.env"),
  moment = read("moment-service/.env");
const dbName = common.MOMENT_DB_NAME || "moments";
if (
  !/^[a-z][a-z0-9_]{0,40}$/.test(dbName) ||
  [
    "postgres",
    common.AUTH_DB_NAME || "accounts",
    common.USER_DB_NAME || "users",
    common.NOTIFICATION_DB_NAME || "notifications",
  ].includes(dbName)
)
  throw new Error("A separate moment database is required");
const storageOrigin =
  moment.MOMENTS_S3_ENDPOINT ||
  media.MEDIA_S3_ENDPOINT ||
  "http://127.0.0.1:9000";
const bucket = moment.MOMENTS_S3_BUCKET || "loccoc-moments-private";
const local = (url) =>
  ["127.0.0.1", "localhost", "[::1]"].includes(new URL(url).hostname);
if (
  !local(storageOrigin) ||
  !local(ai.QDRANT_URL || "http://127.0.0.1:6333") ||
  !local(`http://${common.DB_HOST || "127.0.0.1"}`)
)
  throw new Error("This helper is restricted to local development");
if (bucket === media.MEDIA_S3_BUCKET)
  throw new Error("Do not reuse the public profile bucket");
const missing = [];
if (!ai.GEMINI_EMBEDDING_API_KEY)
  missing.push("ai-service/.env GEMINI_EMBEDDING_API_KEY");
if (!auth.INTERNAL_SERVICE_TOKEN)
  missing.push("existing AuthService INTERNAL_SERVICE_TOKEN");
if (!common.POSTGRES_ADMIN_PASSWORD && !moment.MOMENT_DATABASE_URL)
  missing.push("existing PostgreSQL administrator credential");
if (
  !(moment.MOMENTS_S3_ACCESS_KEY || media.MEDIA_S3_ACCESS_KEY) ||
  !(moment.MOMENTS_S3_SECRET_KEY || media.MEDIA_S3_SECRET_KEY)
)
  missing.push("local object-storage credentials");
const publicKey = resolve(
  root,
  "auth-service",
  auth.JWT_PUBLIC_KEY_PATH || "../secrets/jwt-public.pem",
);
if (!existsSync(publicKey)) missing.push("existing JWT public-key file");
process.stdout.write(
  `Local activation preview: database ${dbName}, private bucket ${bucket}.\n`,
);
process.stdout.write(
  "Writes: ai-service/.env and moment-service/.env only. Existing Gemini/Auth/storage keys are retained.\n",
);
process.stdout.write(
  "Creates: a moment_service DB role if absent, additive moment schema, private bucket if absent, two distinct AI service secrets.\n",
);
process.stdout.write(
  "Development storage uses existing local storage credentials unless dedicated MOMENTS_S3 credentials are already configured. Production requires scoped credentials.\n",
);
process.stdout.write(
  "New application request caps: query 5/min, ingest 5/min, total 100/day and 1000/month unless explicitly configured. These are not Google quota guarantees.\n",
);
if (missing.length)
  process.stdout.write(
    `Missing configuration names (values hidden): ${missing.join(", ")}\n`,
  );
if (!process.argv.includes("--apply")) {
  process.stdout.write(
    "PREVIEW ONLY: no files, secrets or infrastructure changed.\n",
  );
  process.exit(0);
}
if (missing.length)
  throw new Error("Complete the named local prerequisites before applying");
const random = () => randomBytes(32).toString("hex");
for (const key of ["AI_SERVICE_TOKEN", "AI_ACTOR_SECRET"]) {
  if (ai[key] && moment[key] && ai[key] !== moment[key])
    throw new Error(`Existing ${key} differs; refusing to rotate either value`);
}
const serviceToken = ai.AI_SERVICE_TOKEN || moment.AI_SERVICE_TOKEN || random();
const actorSecret = ai.AI_ACTOR_SECRET || moment.AI_ACTOR_SECRET || random();
if (
  serviceToken === actorSecret ||
  serviceToken === auth.INTERNAL_SERVICE_TOKEN
)
  throw new Error("Separate service credentials are required");
const password = random();
const host = common.DB_HOST || "127.0.0.1",
  port = common.DB_PORT || common.POSTGRES_HOST_PORT || "5433";
const newUrl = new URL(`postgresql://${host}:${port}/${dbName}`);
newUrl.username = "moment_service";
newUrl.password = password;
const database = moment.MOMENT_DATABASE_URL || newUrl.toString();
const parsed = new URL(database);
if (!local(database) || parsed.pathname !== `/${dbName}`)
  throw new Error("Unexpected moment database target");
const persist = (file, changes) => {
  const path = resolve(root, file);
  let body = existsSync(path) ? readFileSync(path, "utf8") : "";
  for (const [key, value] of Object.entries(changes)) {
    if (/[\r\n]/.test(String(value)))
      throw new Error("Invalid multiline local value");
    const line = `${key}=${JSON.stringify(String(value))}`;
    const re = new RegExp(`^${key}=.*$`, "m");
    body = re.test(body)
      ? body.replace(re, () => line)
      : `${body.replace(/\s*$/, "")}\n${line}\n`;
  }
  writeFileSync(path, body, { mode: 0o600 });
};
const credentials = {
  AI_SERVICE_TOKEN: serviceToken,
  AI_ACTOR_SECRET: actorSecret,
};
// Save newly generated DB credentials before provisioning, so an interrupted
// run never loses the password. Keep flags off until all provisioning succeeds.
persist("ai-service/.env", {
  ...credentials,
  SEMANTIC_SEARCH_ENABLED: "false",
  QDRANT_URL: ai.QDRANT_URL || "http://127.0.0.1:6333",
  REDIS_URL: ai.REDIS_URL || common.REDIS_URL || "redis://127.0.0.1:6379",
  GEMINI_QUERY_RPM: ai.GEMINI_QUERY_RPM ?? 5,
  GEMINI_INGEST_RPM: ai.GEMINI_INGEST_RPM ?? 5,
  GEMINI_DAILY_REQUEST_CAP: ai.GEMINI_DAILY_REQUEST_CAP ?? 100,
  GEMINI_MONTHLY_REQUEST_CAP: ai.GEMINI_MONTHLY_REQUEST_CAP ?? 1000,
});
persist("moment-service/.env", {
  ...credentials,
  MOMENTS_ENABLED: "false",
  SEMANTIC_SEARCH_ENABLED: "false",
  MOMENT_DATABASE_URL: database,
  AUTH_SERVICE_URL:
    moment.AUTH_SERVICE_URL ||
    common.AUTH_SERVICE_URL ||
    "http://127.0.0.1:8000",
  INTERNAL_SERVICE_TOKEN: auth.INTERNAL_SERVICE_TOKEN,
  JWT_PUBLIC_KEY_PATH: publicKey,
  JWT_ISSUER: auth.JWT_ISSUER || "loccoc-auth",
  JWT_AUDIENCE: auth.JWT_AUDIENCE || "loccoc-api",
  JWT_KID: auth.JWT_KID || "loccoc-2026-01",
  AI_SERVICE_URL: moment.AI_SERVICE_URL || "http://127.0.0.1:8087",
  MOMENTS_S3_ENDPOINT: storageOrigin,
  MOMENTS_S3_BUCKET: bucket,
  MOMENTS_S3_REGION:
    moment.MOMENTS_S3_REGION || media.MEDIA_S3_REGION || "us-east-1",
  MOMENTS_S3_ACCESS_KEY:
    moment.MOMENTS_S3_ACCESS_KEY || media.MEDIA_S3_ACCESS_KEY,
  MOMENTS_S3_SECRET_KEY:
    moment.MOMENTS_S3_SECRET_KEY || media.MEDIA_S3_SECRET_KEY,
  KAFKA_BROKERS: common.KAFKA_BROKERS || "127.0.0.1:9092",
});
const require = createRequire(
  new URL("../moment-service/package.json", import.meta.url),
);
const { Client } = require("pg");
if (!moment.MOMENT_DATABASE_URL) {
  const admin = new Client({
    host,
    port: Number(port),
    user: "postgres",
    password: common.POSTGRES_ADMIN_PASSWORD,
    database: "postgres",
    connectionTimeoutMillis: 3000,
  });
  await admin.connect();
  try {
    if (
      (
        await admin.query(
          "SELECT 1 FROM pg_roles WHERE rolname='moment_service'",
        )
      ).rowCount
    )
      throw new Error(
        "Existing moment_service role: configure its URL explicitly; no password rotation performed",
      );
    await admin.query(
      `CREATE ROLE moment_service LOGIN PASSWORD '${password}'`,
    );
    // Name/password validated/generated above, never user-controlled SQL fragments.
    await admin.query(`CREATE DATABASE "${dbName}" OWNER moment_service`);
  } finally {
    await admin.end();
  }
}
execFileSync(process.execPath, ["dist/migrate.js"], {
  cwd: resolve(root, "moment-service"),
  stdio: "inherit",
});
execFileSync(
  process.execPath,
  [resolve(root, "scripts/configure-moment-storage.mjs")],
  { cwd: root, stdio: "inherit" },
);
persist("ai-service/.env", { SEMANTIC_SEARCH_ENABLED: "true" });
persist("moment-service/.env", {
  MOMENTS_ENABLED: "true",
  SEMANTIC_SEARCH_ENABLED: "true",
});
process.stdout.write(
  "Local configuration/provisioning complete. Start both backends; build Flutter with MOMENTS_ENABLED=true. No running services were restarted.\n",
);
