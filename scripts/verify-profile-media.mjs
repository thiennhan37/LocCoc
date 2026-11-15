// Disposable object storage and schema-isolated PostgreSQL; never print secrets.
import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
const require = createRequire(
  new URL("../user-service/package.json", import.meta.url),
);
const {
  S3Client,
  CreateBucketCommand,
  PutBucketPolicyCommand,
  ListBucketsCommand,
} = require("@aws-sdk/client-s3");
const config = parseEnv(
  readFileSync(new URL("../.env", import.meta.url), "utf8"),
);
const name = `loccoc-media-test-${randomBytes(5).toString("hex")}`;
const access = "media-test",
  secret = randomBytes(24).toString("hex");
function docker(args) {
  const result = spawnSync("docker", args, { encoding: "utf8" });
  if (result.status !== 0)
    throw new Error(result.stderr?.trim() || "Docker failed");
  return result.stdout.trim();
}
let s3;
try {
  docker([
    "run",
    "-d",
    "--name",
    name,
    "-p",
    "127.0.0.1::8333",
    "-e",
    `AWS_ACCESS_KEY_ID=${access}`,
    "-e",
    `AWS_SECRET_ACCESS_KEY=${secret}`,
    "chrislusf/seaweedfs:4.53@sha256:ccad23e18639c8b98cee17e7100b95830a06077b56d8e5b006d6dcf8ec5e94a0",
    "mini",
    "-dir=/data",
  ]);
  const binding = docker(["port", name, "8333/tcp"]);
  const endpoint = `http://${binding}`;
  s3 = new S3Client({
    endpoint,
    region: "us-east-1",
    forcePathStyle: true,
    maxAttempts: 1,
    credentials: { accessKeyId: access, secretAccessKey: secret },
  });
  let ready = false;
  for (let i = 0; i < 60; i++) {
    try {
      await s3.send(new ListBucketsCommand({}), {
        abortSignal: AbortSignal.timeout(1000),
      });
      ready = true;
    } catch {}
    if (ready) break;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  if (!ready) throw new Error("Disposable S3 not ready");
  await s3.send(new CreateBucketCommand({ Bucket: "loccoc-media-test" }));
  await s3.send(
    new PutBucketPolicyCommand({
      Bucket: "loccoc-media-test",
      Policy: JSON.stringify({
        Version: "2012-10-17",
        Statement: [
          {
            Effect: "Allow",
            Principal: "*",
            Action: "s3:GetObject",
            Resource: "arn:aws:s3:::loccoc-media-test/*",
          },
        ],
      }),
    }),
  );
  console.log(
    "Disposable SeaweedFS ready; running schema-isolated PostgreSQL/media HTTP tests.",
  );
  const dbUrl = `postgresql://postgres:${encodeURIComponent(config.POSTGRES_ADMIN_PASSWORD)}@127.0.0.1:${config.POSTGRES_HOST_PORT || 5433}/postgres`;
  const vitest = fileURLToPath(
    new URL("../user-service/node_modules/vitest/vitest.mjs", import.meta.url),
  );
  const args = process.argv.slice(2);
  const result = spawnSync(
    process.execPath,
    [
      vitest,
      "run",
      "--config",
      "vitest.config.e2e.ts",
      ...(args.length ? args : ["media.postgres"]),
    ],
    {
      cwd: new URL("../user-service", import.meta.url),
      stdio: "inherit",
      env: {
        ...process.env,
        MEDIA_TEST_DB_URL: dbUrl,
        SOCIAL_TEST_DB_URL: dbUrl,
        DISCOVERY_TEST_DB_URL: dbUrl,
        MEDIA_TEST_S3_ENDPOINT: endpoint,
        MEDIA_TEST_S3_ACCESS_KEY: access,
        MEDIA_TEST_S3_SECRET_KEY: secret,
      },
    },
  );
  process.exitCode = result.status ?? 1;
} finally {
  s3?.destroy();
  try {
    docker(["rm", "-f", "-v", name]);
    console.log("Disposable S3 container and anonymous volumes removed.");
  } catch {}
}
