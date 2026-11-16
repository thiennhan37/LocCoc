import { readFileSync } from "node:fs";
import { resolve } from "node:path";

export function validateEnvironment(input: Record<string, unknown>) {
  const value = { ...input };
  for (const key of ["MOMENTS_ENABLED", "SEMANTIC_SEARCH_ENABLED"]) {
    value[key] ??= "false";
    if (!["true", "false"].includes(String(value[key])))
      throw new Error(`Invalid ${key}`);
  }
  for (const [key, fallback, max] of [
    ["MOMENT_PORT", 8088, 65535],
    ["MOMENTS_MAX_PER_OWNER", 1000, 100000],
    ["MOMENTS_UPLOADS_PER_HOUR", 30, 1000],
  ] as const) {
    const n = Number(value[key] ?? fallback);
    if (!Number.isInteger(n) || n < 1 || n > max)
      throw new Error(`Invalid ${key}`);
    value[key] = n;
  }
  if (value.MOMENTS_ENABLED !== "true") return value;
  for (const key of [
    "MOMENT_DATABASE_URL",
    "AUTH_SERVICE_URL",
    "INTERNAL_SERVICE_TOKEN",
    "JWT_PUBLIC_KEY_PATH",
    "MOMENTS_S3_ENDPOINT",
    "MOMENTS_S3_BUCKET",
    "MOMENTS_S3_ACCESS_KEY",
    "MOMENTS_S3_SECRET_KEY",
  ]) {
    if (typeof value[key] !== "string" || !value[key])
      throw new Error(`Missing ${key}`);
  }
  if (String(value.INTERNAL_SERVICE_TOKEN).length < 32)
    throw new Error("Invalid service token");
  for (const key of [
    "AUTH_SERVICE_URL",
    "MOMENTS_S3_ENDPOINT",
    ...(value.SEMANTIC_SEARCH_ENABLED === "true" ? ["AI_SERVICE_URL"] : []),
  ]) {
    const url = new URL(String(value[key]));
    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      url.pathname !== "/" ||
      (value.NODE_ENV === "production" && url.protocol !== "https:")
    )
      throw new Error(`Invalid ${key}`);
  }
  if (!/^postgres(ql)?:/.test(String(value.MOMENT_DATABASE_URL)))
    throw new Error("Invalid moment database URL");
  if (
    !/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(
      String(value.MOMENTS_S3_BUCKET),
    ) ||
    value.MOMENTS_S3_BUCKET === value.MEDIA_S3_BUCKET
  )
    throw new Error("Dedicated private moment bucket required");
  value.JWT_PUBLIC_KEY = readFileSync(
    resolve(String(value.JWT_PUBLIC_KEY_PATH)),
    "utf8",
  );
  if (value.SEMANTIC_SEARCH_ENABLED === "true") {
    for (const key of ["AI_SERVICE_TOKEN", "AI_ACTOR_SECRET"]) {
      if (String(value[key] ?? "").length < 32)
        throw new Error(`Invalid ${key}`);
    }
    if (
      value.AI_SERVICE_TOKEN === value.AI_ACTOR_SECRET ||
      value.AI_SERVICE_TOKEN === value.INTERNAL_SERVICE_TOKEN
    )
      throw new Error("Service credentials must differ");
  }
  return value;
}
