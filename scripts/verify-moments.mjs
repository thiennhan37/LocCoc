import { spawn, execFileSync } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import net from "node:net";
import { resolve } from "node:path";
import { readFileSync } from "node:fs";

// Only disposable containers named in this run are removed. No compose volumes,
// repository .env files, production databases or existing collections are touched.
const root = resolve(import.meta.dirname, "..");
const prefix = `loccoc-moment-check-${randomUUID().slice(0, 8)}`;
const names = [];
let ai;
const secret = () => randomBytes(32).toString("hex");
const dbPassword = secret(),
  serviceToken = secret(),
  actorSecret = secret(),
  storageKey = secret(),
  qdrantKey = secret();
const docker = (args) =>
  execFileSync("docker", args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
const run = (name, image, env, port, args = []) => {
  const n = `${prefix}-${name}`;
  docker([
    "run",
    "-d",
    "--name",
    n,
    "-p",
    `127.0.0.1::${port}`,
    ...Object.entries(env).flatMap(([k, v]) => ["-e", `${k}=${v}`]),
    image,
    ...args,
  ]);
  names.push(n);
  const bind = docker(["port", n, `${port}/tcp`]);
  return Number(bind.split(":").at(-1));
};
const freePort = () =>
  new Promise((done, reject) => {
    const s = net.createServer();
    s.on("error", reject);
    s.listen(0, "127.0.0.1", () => {
      const p = s.address().port;
      s.close(() => done(p));
    });
  });
const wait = async (work) => {
  for (let i = 0; i < 90; i++) {
    try {
      await work();
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  throw new Error("Isolated dependency did not become ready");
};
const child = async (command, args, env, cwd = root) => {
  const p = spawn(command, args, {
    cwd,
    env: { ...process.env, ...env },
    stdio: "inherit",
    shell: false,
  });
  const result = await new Promise((done, reject) => {
    p.once("error", reject);
    p.once("exit", (code) => done(code));
  });
  if (result !== 0)
    throw new Error(`Verification subprocess failed (exit ${result})`);
};
try {
  const db = run(
    "postgres",
    "postgres:17",
    { POSTGRES_PASSWORD: dbPassword, POSTGRES_DB: "moment_test" },
    5432,
  );
  const redis = run("redis", "redis:7-alpine", {}, 6379);
  const qdrant = run(
    "qdrant",
    "qdrant/qdrant@sha256:9bfc89f9914fc14876a88c05270685921a55b8877b254a98bcc1cc2f0a424cd2",
    { QDRANT__SERVICE__API_KEY: qdrantKey },
    6333,
  );
  const s3 = run(
    "s3",
    "chrislusf/seaweedfs:4.53@sha256:ccad23e18639c8b98cee17e7100b95830a06077b56d8e5b006d6dcf8ec5e94a0",
    { AWS_ACCESS_KEY_ID: "fixture-access", AWS_SECRET_ACCESS_KEY: storageKey },
    8333,
    ["mini", "-dir=/data", "-s3.port=8333"],
  );
  const aiPort = await freePort();
  const env = {
    NODE_ENV: "test",
    MOMENTS_ENABLED: "true",
    SEMANTIC_SEARCH_ENABLED: "true",
    IMAGE_ENHANCEMENT_ENABLED: "true",
    GEMINI_API_KEY: "fixture-not-real",
    GEMINI_IMAGE_MODEL: "fixture-model",
    GEMINI_ENHANCEMENT_RPM: "30",
    GEMINI_ENHANCEMENT_DAILY_CAP: "100",
    GEMINI_ENHANCEMENT_MONTHLY_CAP: "100",
    POST_TEST_DB_URL: `jdbc:postgresql://127.0.0.1:${db}/moment_test`,
    POST_TEST_DB_PASSWORD: dbPassword,
    POST_S3_TEST_ENDPOINT: `http://127.0.0.1:${s3}`,
    POST_S3_TEST_ACCESS_KEY: "fixture-access",
    POST_S3_TEST_SECRET_KEY: storageKey,
    POST_AI_TEST_URL: `http://127.0.0.1:${aiPort}`,
    REDIS_URL: `redis://127.0.0.1:${redis}`,
    QDRANT_URL: `http://127.0.0.1:${qdrant}`,
    QDRANT_API_KEY: qdrantKey,
    AI_SERVICE_URL: `http://127.0.0.1:${aiPort}`,
    AI_SERVICE_TOKEN: serviceToken,
    AI_ACTOR_SECRET: actorSecret,
    GEMINI_EMBEDDING_API_KEY: "fixture-not-real",
    MOMENTS_S3_ENDPOINT: `http://127.0.0.1:${s3}`,
    MOMENTS_S3_BUCKET: "moment-fixture-private",
    MOMENTS_S3_ACCESS_KEY: "fixture-access",
    MOMENTS_S3_SECRET_KEY: storageKey,
    MOMENTS_MAX_PER_OWNER: "1000",
    MOMENTS_UPLOADS_PER_HOUR: "1000",
  };
  await wait(async () => {
    if (
      docker([
        "exec",
        `${prefix}-postgres`,
        "pg_isready",
        "-U",
        "postgres",
        "-d",
        "moment_test",
      ]).includes("no response")
    )
      throw new Error();
  });
  await wait(async () => {
    const r = await fetch(env.QDRANT_URL + "/healthz", {
      headers: { "api-key": qdrantKey },
    });
    if (!r.ok) throw new Error();
  });
  await wait(async () => {
    const r = await fetch(env.MOMENTS_S3_ENDPOINT);
    if (r.status >= 500) throw new Error();
  });
  const python = resolve(root, "ai-service/.venv/Scripts/python.exe");
  ai = spawn(
    python,
    [
      "-m",
      "uvicorn",
      "tests.integration_server:app",
      "--host",
      "127.0.0.1",
      "--port",
      String(aiPort),
      "--no-access-log",
    ],
    {
      cwd: resolve(root, "ai-service"),
      env: { ...process.env, ...env },
      stdio: ["ignore", "ignore", "pipe"],
    },
  );
  // Keep stderr private: dependency errors must not expose process credentials.
  ai.stderr.on("data", () => {});
  await wait(async () => {
    const r = await fetch(env.AI_SERVICE_URL + "/health/live");
    if (!r.ok) throw new Error();
  });
  // Validate the production SQL, twice, before Hibernate validate and concurrency tests.
  for (const file of ["post-service/schema-postgresql.sql", "post-service/migrations/002-unified-moments.sql", "post-service/migrations/002-unified-moments.sql"]) {
    execFileSync("docker", ["exec", "-i", `${prefix}-postgres`, "psql", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "moment_test"], {
      input: readFileSync(resolve(root, file)), stdio: ["pipe", "pipe", "pipe"], timeout: 30000,
    });
  }
  await child(python,["-m","pytest","-q","integration/redis_contract.py"],env,resolve(root,"ai-service"));
  await child(process.execPath,["scripts/verify-unified-ai-gateway.mjs"],env);
  if (process.platform === "win32") {
    await child("powershell.exe", ["-NoProfile", "-Command", "& mvn -B -q -f post-service/pom.xml '-Dtest=UnifiedMomentsTests,S3PhotoIntegrationTests,AiProtocolIntegrationTests' test; exit $LASTEXITCODE"],env);
  } else {
    await child("mvn",["-B","-q","-f","post-service/pom.xml","-Dtest=UnifiedMomentsTests,S3PhotoIntegrationTests,AiProtocolIntegrationTests","test"],env);
  }
  process.stdout.write(
    "Isolated Java Post/Moments integration verification PASS (fake provider; no live Gemini calls).\n",
  );
} finally {
  if (ai) {
    ai.kill();
    await new Promise((r) => (ai.exitCode !== null ? r() : ai.once("exit", r)));
  }
  for (const n of names.reverse()) {
    try {
      docker(["rm", "-f", n]);
    } catch {
      process.stderr.write(`Cleanup required: ${n}\n`);
    }
  }
}
