// Explicit provisioning: only the configured media bucket/policy, never secrets.
import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import { createRequire } from "node:module";
const require = createRequire(
  new URL("../user-service/package.json", import.meta.url),
);
const {
  S3Client,
  CreateBucketCommand,
  HeadBucketCommand,
  PutBucketPolicyCommand,
} = require("@aws-sdk/client-s3");
const config = {
  ...parseEnv(readFileSync(new URL("../.env", import.meta.url), "utf8")),
  ...parseEnv(
    readFileSync(new URL("../user-service/.env", import.meta.url), "utf8"),
  ),
  ...process.env,
};
for (const key of [
  "MEDIA_S3_ENDPOINT",
  "MEDIA_S3_BUCKET",
  "MEDIA_S3_ACCESS_KEY",
  "MEDIA_S3_SECRET_KEY",
]) {
  if (!config[key])
    throw new Error(`Missing ${key}; configure local environment first`);
}
const client = new S3Client({
  endpoint: config.MEDIA_S3_ENDPOINT,
  region: config.MEDIA_S3_REGION || "us-east-1",
  forcePathStyle: true,
  credentials: {
    accessKeyId: config.MEDIA_S3_ACCESS_KEY,
    secretAccessKey: config.MEDIA_S3_SECRET_KEY,
  },
  maxAttempts: 1,
});
try {
  try {
    await client.send(
      new HeadBucketCommand({ Bucket: config.MEDIA_S3_BUCKET }),
    );
  } catch (error) {
    if (error.$metadata?.httpStatusCode !== 404) throw error;
    await client.send(
      new CreateBucketCommand({ Bucket: config.MEDIA_S3_BUCKET }),
    );
  }
  await client.send(
    new PutBucketPolicyCommand({
      Bucket: config.MEDIA_S3_BUCKET,
      Policy: JSON.stringify({
        Version: "2012-10-17",
        Statement: [
          {
            Effect: "Allow",
            Principal: "*",
            Action: "s3:GetObject",
            Resource: `arn:aws:s3:::${config.MEDIA_S3_BUCKET}/*`,
          },
        ],
      }),
    }),
  );
  console.log(
    "Media bucket provisioned with anonymous object reads only. Anonymous list/write are not granted.",
  );
} finally {
  client.destroy();
}
