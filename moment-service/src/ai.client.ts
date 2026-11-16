import { createHmac, randomUUID } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

export class AiError extends Error {
  constructor(
    readonly code: string,
    readonly permanent = false,
    readonly retryAfter = 0,
  ) {
    super(code);
  }
}

export function capability(owner: string, op: string, secret: string) {
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(
    JSON.stringify({ alg: "HS256", typ: "JWT" }),
  ).toString("base64url");
  const body = Buffer.from(
    JSON.stringify({
      sub: owner,
      op,
      iat: now,
      exp: now + 45,
      iss: "moment-service",
      aud: "loccoc-ai",
      jti: randomUUID(),
    }),
  ).toString("base64url");
  const sig = createHmac("sha256", secret)
    .update(`${header}.${body}`)
    .digest("base64url");
  return `${header}.${body}.${sig}`;
}

@Injectable()
export class AiClient {
  constructor(private readonly config: ConfigService) {}
  get enabled() {
    return this.config.get("SEMANTIC_SEARCH_ENABLED", "false") === "true";
  }
  async call(
    owner: string,
    op: string,
    method: string,
    path: string,
    body?: object | Buffer,
    metadata?: object,
  ) {
    if (!this.enabled) throw new AiError("SEMANTIC_DISABLED");
    try {
      const response = await fetch(
        `${this.config.getOrThrow<string>("AI_SERVICE_URL")}${path}`,
        {
          method,
          redirect: "error",
          signal: AbortSignal.timeout(op === "search" ? 4000 : 12000),
          headers: {
            "x-service-token":
              this.config.getOrThrow<string>("AI_SERVICE_TOKEN"),
            ...(metadata
              ? {
                  "x-ai-metadata": Buffer.from(
                    JSON.stringify(metadata),
                  ).toString("base64url"),
                }
              : {}),
            "x-ai-actor": capability(
              owner,
              op,
              this.config.getOrThrow<string>("AI_ACTOR_SECRET"),
            ),
            "content-type": Buffer.isBuffer(body)
              ? "image/jpeg"
              : "application/json",
          },
          body: body
            ? Buffer.isBuffer(body)
              ? new Uint8Array(body)
              : JSON.stringify(body)
            : undefined,
        },
      );
      if (!response.ok) {
        // Never propagate provider messages or raw upstream errors.
        const data = (await response.json().catch(() => ({}))) as {
          code?: string;
        };
        const permanent =
          [400, 401, 403, 404, 413, 415, 422].includes(response.status) ||
          data.code === "PROVIDER_CONFIGURATION_ERROR";
        const code = [
          "PROVIDER_CONFIGURATION_ERROR",
          "PROVIDER_RATE_LIMITED",
          "PROVIDER_QUOTA_EXHAUSTED",
          "QUOTA_UNAVAILABLE",
        ].includes(data.code ?? "")
          ? data.code!
          : "SEMANTIC_UNAVAILABLE";
        const retry = Number(response.headers.get("retry-after"));
        throw new AiError(
          permanent ? "AI_CONFIGURATION_OR_INPUT_ERROR" : code,
          permanent,
          Number.isFinite(retry) ? Math.min(3600, Math.max(0, retry)) : 0,
        );
      }
      return (await response.json()) as Record<string, unknown>;
    } catch (e) {
      if (e instanceof AiError) throw e;
      throw new AiError("SEMANTIC_UNAVAILABLE");
    }
  }
  async search(
    owner: string,
    query: string,
    filters: {
      albumId?: string;
      place?: string;
      dateFrom?: string;
      dateTo?: string;
    } = {},
  ) {
    const result = await this.call(
      owner,
      "search",
      "POST",
      "/internal/search",
      {
        query,
        limit: 200,
        album_id: filters.albumId ?? null,
        place: filters.place ?? null,
        date_from: filters.dateFrom ?? null,
        date_to: filters.dateTo ?? null,
      },
    );
    if (
      result.profileId !== "gemini2-d768-imgv1-queryv1" ||
      !Array.isArray(result.items) ||
      result.items.length > 200
    )
      throw new AiError("INVALID_AI_RESPONSE");
    return result.items.filter(
      (x): x is { assetId: string; assetVersion: number } =>
        x &&
        typeof x.assetId === "string" &&
        /^[0-9a-f-]{36}$/.test(x.assetId) &&
        Number.isInteger(x.assetVersion) &&
        x.assetVersion > 0,
    );
  }
  async index(
    owner: string,
    asset: string,
    version: number,
    bytes: Buffer,
    metadata: object,
  ) {
    const r = await this.call(
      owner,
      `index:${asset}:${version}`,
      "PUT",
      `/internal/assets/${asset}/${version}`,
      bytes,
      metadata,
    );
    if (r.profileId !== "gemini2-d768-imgv1-queryv1" || r.status !== "ready")
      throw new AiError("INVALID_AI_RESPONSE");
  }
  async remove(owner: string, asset: string) {
    await this.call(
      owner,
      `delete:${asset}`,
      "DELETE",
      `/internal/assets/${asset}`,
    );
  }
}
