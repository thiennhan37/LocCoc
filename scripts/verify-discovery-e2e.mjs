// Disposable authenticated PostgreSQL/Neo4j; existing Redis/Kafka are used only
// with UUID-scoped keys/topics created and removed by the integration suites.
import { randomBytes, randomUUID } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = fileURLToPath(new URL("..", import.meta.url));
const require = createRequire(
  new URL("../user-service/package.json", import.meta.url),
);
const { Client } = require("pg");
const suffix = randomUUID().slice(0, 8);
const pgName = `loccoc-discovery-pg-${suffix}`,
  neoName = `loccoc-discovery-neo-${suffix}`;
const pgPassword = randomBytes(24).toString("hex"),
  neoPassword = randomBytes(24).toString("hex");
const env = {
  ...process.env,
  POSTGRES_PASSWORD: pgPassword,
  NEO4J_AUTH: `neo4j/${neoPassword}`,
};
const created = [];
function docker(args) {
  const r = spawnSync("docker", args, { env, encoding: "utf8" });
  if (r.status !== 0)
    throw new Error(`Docker ${args[0]} failed: ${r.stderr?.trim()}`);
  return r.stdout.trim();
}
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function ready(check, label) {
  for (let i = 0; i < 90; i++) {
    try {
      await check();
      return;
    } catch {
      await delay(1000);
    }
  }
  throw new Error(`${label} readiness timed out`);
}
async function run() {
  docker([
    "run",
    "-d",
    "--rm",
    "--name",
    pgName,
    "-e",
    "POSTGRES_PASSWORD",
    "-e",
    "POSTGRES_DB=discovery_test",
    "-p",
    "127.0.0.1::5432",
    "postgres:17",
  ]);
  created.push(pgName);
  docker([
    "run",
    "-d",
    "--rm",
    "--name",
    neoName,
    "-e",
    "NEO4J_AUTH",
    "-e",
    "NEO4J_server_memory_heap_initial__size=256m",
    "-e",
    "NEO4J_server_memory_heap_max__size=512m",
    "-e",
    "NEO4J_server_memory_pagecache_size=128m",
    "-e",
    "NEO4J_db_transaction_timeout=3s",
    "-p",
    "127.0.0.1::7474",
    "neo4j:5.26.33-community",
  ]);
  created.push(neoName);
  const pgPort = docker(["port", pgName, "5432/tcp"]).split(":").at(-1);
  const neoPort = docker(["port", neoName, "7474/tcp"]).split(":").at(-1);
  const dbUrl = `postgresql://postgres:${pgPassword}@127.0.0.1:${pgPort}/discovery_test`;
  const neoUrl = `http://127.0.0.1:${neoPort}`;
  await ready(async () => {
    const c = new Client({ connectionString: dbUrl });
    try {
      await c.connect();
      await c.query("SELECT 1");
    } finally {
      await c.end();
    }
  }, "PostgreSQL");
  await ready(async () => {
    const r = await fetch(`${neoUrl}/db/neo4j/tx/commit`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Basic ${Buffer.from(`neo4j:${neoPassword}`).toString("base64")}`,
      },
      body: JSON.stringify({ statements: [{ statement: "RETURN 1 AS ok" }] }),
      signal: AbortSignal.timeout(2000),
    });
    if (!r.ok || (await r.json()).errors.length) throw new Error("not ready");
  }, "Neo4j");
  console.log("Disposable PostgreSQL and authenticated Neo4j are ready.");
  const testEnv = {
    ...process.env,
    NODE_ENV: "test",
    DISCOVERY_TEST_DB_URL: dbUrl,
    SOCIAL_TEST_DB_URL: dbUrl,
    OUTBOX_TEST_DB_URL: dbUrl,
    DISCOVERY_TEST_NEO4J_URL: neoUrl,
    DISCOVERY_TEST_NEO4J_PASSWORD: neoPassword,
    DISCOVERY_TEST_REDIS_URL:
      process.env.DISCOVERY_TEST_REDIS_URL ?? "redis://127.0.0.1:6379/14",
    DISCOVERY_TEST_KAFKA_BROKERS:
      process.env.DISCOVERY_TEST_KAFKA_BROKERS ?? "127.0.0.1:9092",
    SOCIAL_TEST_KAFKA_BROKERS:
      process.env.SOCIAL_TEST_KAFKA_BROKERS ?? "127.0.0.1:9092",
  };
  const npmCli = path.join(
    path.dirname(process.execPath),
    "node_modules",
    "npm",
    "bin",
    "npm-cli.js",
  );
  const args = [
    npmCli,
    "--prefix",
    "user-service",
    "run",
    "test:e2e",
    "--",
    ...process.argv.slice(2),
  ];
  const code = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, {
      cwd: root,
      env: testEnv,
      stdio: "inherit",
    });
    child.once("error", reject);
    child.once("exit", (c) => resolve(c ?? 1));
  });
  process.exitCode = code;
}
try {
  await run();
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  for (const name of created.reverse()) {
    const r = spawnSync("docker", ["stop", "-t", "3", name], {
      env,
      encoding: "utf8",
    });
    if (r.status !== 0) {
      console.error(`Could not remove test container ${name}`);
      process.exitCode = 1;
    }
  }
  console.log("Disposable test containers removed.");
}
