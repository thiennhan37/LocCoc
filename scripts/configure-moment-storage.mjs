// Explicit additive provisioning of a NEW private bucket. Refuses public buckets;
// never rewrites an existing policy or the public profile-media bucket.
import { readFileSync, existsSync } from "node:fs";
import { parseEnv } from "node:util";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
const require = createRequire(
  new URL("../moment-service/package.json", import.meta.url),
);
const {
  S3Client,
  CreateBucketCommand,
  HeadBucketCommand,
  GetBucketPolicyCommand,
  GetBucketAclCommand,
  PutObjectCommand,
  DeleteObjectCommand,
} = require("@aws-sdk/client-s3");
const file = new URL("../moment-service/.env", import.meta.url);
const config = {
  ...(existsSync(file) ? parseEnv(readFileSync(file, "utf8")) : {}),
  ...process.env,
};
for (const key of [
  "MOMENTS_S3_ENDPOINT",
  "MOMENTS_S3_BUCKET",
  "MOMENTS_S3_ACCESS_KEY",
  "MOMENTS_S3_SECRET_KEY",
])
  if (!config[key]) throw new Error(`Configure ${key} before provisioning`);
const endpoint = new URL(config.MOMENTS_S3_ENDPOINT);
if (
  !["http:", "https:"].includes(endpoint.protocol) ||
  endpoint.username ||
  endpoint.password ||
  endpoint.search ||
  endpoint.hash ||
  endpoint.pathname !== "/"
)
  throw new Error("Invalid storage origin");
const bucket = config.MOMENTS_S3_BUCKET;
if (
  bucket === config.MEDIA_S3_BUCKET ||
  !/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(bucket)
)
  throw new Error("Dedicated private bucket required");
const client = new S3Client({
  endpoint: endpoint.origin,
  region: config.MOMENTS_S3_REGION || "us-east-1",
  forcePathStyle: true,
  maxAttempts: 1,
  credentials: {
    accessKeyId: config.MOMENTS_S3_ACCESS_KEY,
    secretAccessKey: config.MOMENTS_S3_SECRET_KEY,
  },
});
const key = `privacy-check/${randomUUID()}.txt`;
let created = false;
try {
  try {
    await client.send(new HeadBucketCommand({ Bucket: bucket }));
  } catch (e) {
    if (e.$metadata?.httpStatusCode !== 404)
      throw new Error("Bucket cannot be inspected");
    await client.send(new CreateBucketCommand({ Bucket: bucket }));
  }
  const acl = await client.send(new GetBucketAclCommand({ Bucket: bucket }));
  if (acl.Grants?.some((g) => g.Grantee?.URI?.includes("/global/")))
    throw new Error("Public bucket ACL: refusing to continue");
  try {
    const r = await client.send(new GetBucketPolicyCommand({ Bucket: bucket }));
    const p = JSON.parse(r.Policy || "{}");
    if (
      p.Statement?.some(
        (s) =>
          s.Effect === "Allow" &&
          (s.NotPrincipal !== undefined ||
            s.Principal === "*" ||
            JSON.stringify(s.Principal ?? null).includes('"*"')),
      )
    )
      throw new Error("Public bucket policy: refusing to continue");
  } catch (e) {
    if (e.name !== "NoSuchBucketPolicy") throw e;
  }
  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: "synthetic privacy probe",
      ContentType: "text/plain",
      CacheControl: "no-store",
    }),
  );
  created = true;
  for (const probe of [
    { path: `/${bucket}/${key}`, method: "GET" },
    { path: `/${bucket}?list-type=2`, method: "GET" },
    {
      path: `/${bucket}/${key}`,
      method: "PUT",
      body: "anonymous synthetic probe",
    },
    { path: `/${bucket}/${key}`, method: "DELETE" },
  ]) {
    const r = await fetch(endpoint.origin + probe.path, {
      method: probe.method,
      ...(probe.body ? { body: probe.body } : {}),
      redirect: "error",
      signal: AbortSignal.timeout(3000),
    });
    await r.arrayBuffer();
    if (![401, 403].includes(r.status))
      throw new Error("Anonymous access was not denied");
  }
  process.stdout.write(
    "PASS: private bucket ready; anonymous read/list/write/delete denied. No policy rewritten.\n",
  );
} finally {
  if (created)
    await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
  client.destroy();
}
