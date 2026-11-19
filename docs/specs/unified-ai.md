# Unified Python AI implementation

One `ai-service` process on 8087 hosts image enhancement and internal semantic
search. API, image validation, provider adapter and budget policy live in a
separate enhancement module. The original two fixed prompts are preserved.

Acceptance: JPEG/PNG/WebP multipart input; identical filter IDs and binary MIME
responses; transparent sticker enforcement; safe errors and no-store headers;
unknown/duplicate fields and MIME spoofing rejected; size/pixel/timeout limits;
disconnect cancellation; provider no-retry; fail-closed Redis budget; service
authentication; internal endpoints remain unreachable through Gateway; semantic
tests continue passing when enhancement is disabled or its provider fails.

Deployment: configure feature flags, image model/key, independent enhancement
budgets, and service token in Python's existing local environment. Gateway reads
AI_SERVICE_TOKEN and AI_SERVICE_URL=http://127.0.0.1:8087 from its own environment.
Java POST_AI_SERVICE_URL already uses that origin. No new image/database migration.
No live Gemini calls are needed for automated verification.

## Deployment

1. Install the pinned `ai-service/requirements-dev.txt` into its existing venv,
   or rebuild the existing Python image (`docker compose --profile moments build ai-service`).
2. Stop the former enhancement process on 8082 if it is running. Do not run the
   old Node runtime alongside the merged image API. The code has been retired;
   ignored local build files are archived under `logs/retired-ai-enhancement-*`.
3. Preserve local secrets. The Node runtime formerly read root `.env`; configure
   the same intended image key/model in `ai-service/.env` as `GEMINI_API_KEY` and
   `GEMINI_IMAGE_MODEL`. Keep the embedding key in `GEMINI_EMBEDDING_API_KEY`.
4. Set `IMAGE_ENHANCEMENT_ENABLED=true` and explicit independent
   `GEMINI_ENHANCEMENT_RPM`, `GEMINI_ENHANCEMENT_DAILY_CAP`,
   `GEMINI_ENHANCEMENT_MONTHLY_CAP`. Defaults are zero, so no paid call is made
   until the operator chooses a budget. Redis outage also prevents calls.
5. In `api-gateway/.env`, set `AI_SERVICE_URL=http://127.0.0.1:8087` and the same
   `AI_SERVICE_TOKEN` as Python. Root env values are not Gateway's local env.
   Existing ignored Gateway configs pointing at 8082 need this explicit change.
   Java's `POST_AI_SERVICE_URL` and actor capability remain unchanged.
6. Start `npm run start:ai`, or use `docker compose --profile moments up -d --build`.
   Restart the Nest Gateway. Calls retain `/ai/images/enhance`. Spring Gateway
   still lacks the AI route; its feature parity remains a separate task.

Current image endpoint is the public Gateway MVP with IP throttling. Python
requires service authentication; internal embedding also requires actor scope.
No schema, bucket or image migration is necessary for this merge.

## Implementation and verification

- `app/enhancement/router.py`: strict multipart, deadline-aware cancellation.
- `images.py`: format/MIME/full decode/size/pixels and PNG transparency checks.
- `service.py`: bounded concurrency, budget reservation, safe operational logs.
- `provider.py`: Gemini adapter with inline image-only output, no retries or
  automatic continuation, and no remote output URL fetch.
- Existing semantic modules retain owner/version capabilities and Qdrant schema.

The adapter uses the installed pinned google-genai SDK and the documented
[Interactions image response format](https://ai.google.dev/gemini-api/docs/interactions-breaking-changes-may-2026).
Prompts and their attribution are preserved from NhanTr's original Nest code.

```powershell
npm run test:ai
pnpm --filter @loccoc/common build
pnpm --filter api-gateway build
pnpm --filter api-gateway test:e2e
node scripts/verify-moments.mjs
```

The isolated verifier tests both filter contracts through the real Gateway HTTP
proxy and Python fixture with Redis budgets, then runs Java/PostgreSQL/S3/Qdrant
checks against the same Python process. Gemini is replaced with deterministic
fixtures throughout; no paid request or personal-data migration is performed.
