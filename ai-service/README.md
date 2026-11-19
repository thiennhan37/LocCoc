# LocCoc AI service

The single Python AI runtime for image enhancement and semantic search.
The retired Nest enhancement implementation is now `app/enhancement`; its original
fixed prompts were written by NhanTr and are preserved.
Gemini Embedding 2 produces one vector per JPEG or text query (768 dimensions by
default). Visual search first translates the user's query into English with
`gemini-3.1-flash-lite`; Post retains the original text for fuzzy caption matching.
The vector space/profile is `gemini2-d768-imgv1-queryv1`; the collection is
`moments_gemini2_d768_v1`. No GPU, torch, transformers, model downloads, URL fetch,
public embeddings endpoint or legacy embedding provider remains in the runtime.

## Local setup (PowerShell)

```powershell
cd ai-service
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements-dev.txt
# Preserve existing .env; copy .env.example only when the file does not exist.
.\.venv\Scripts\python.exe -m pytest -q
.\.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8087 --no-access-log
```

`GEMINI_EMBEDDING_API_KEY` belongs only in ignored `ai-service/.env` or a secret manager.
The existing key field is preserved by consolidation. Enabling semantic runtime
also requires distinct `AI_SERVICE_TOKEN` and `AI_ACTOR_SECRET` (>=32 characters),
Qdrant/Redis, and nonzero provider request caps. Zero caps fail closed. Configure
caps against your actual provider/project quota; application caps do not change
Google quota and are request-count limits, not authoritative billing estimates.

All operations require the service token and a signed, <=60-second actor JWT
with issuer `post-service`, audience `loccoc-ai`, owner UUID and exact operation.
Only process liveness (`GET /health/live`) is anonymous. Docs/CORS are disabled.
Readiness validates the index and Redis and requires a successful provider call
within five minutes. `POST /internal/canary`, scoped `health`, explicitly performs
a quota-reserved live text probe; ordinary health checks never call Gemini.
Use liveness, rather than semantic readiness, for container restart policy.

Internal contracts:

- `POST /internal/search`: strict query/limit/filters; returns IDs/versions only.
- `PUT /internal/assets/{assetId}/{version}`: processed JPEG <=2 MiB, <=1536 axes;
  base64url JSON `x-ai-metadata` contains capturedAt/albumId/place. Owner comes
  from the capability; point UUID includes owner + asset + version + profile.
- `DELETE /internal/assets/{assetId}`: mandatory owner/asset filter.

Retries are disabled for interactive provider requests. Timeout/429/config errors
are sanitized; Redis reservations bound requests across instances and fail closed.
Query cache is bounded (512 vectors/15 minutes), HMAC keyed by owner/profile/exact
formatted query. Neither vectors nor cache hits bypass MomentService's final ACL.

`QUERY_TRANSLATION_ENABLED=true` enables English normalization; the configurable
model is `GEMINI_QUERY_TRANSLATION_MODEL`. Translation uses the explicit
`GEMINI_EMBEDDING_API_KEY` client and requires that key to allow text generation
for the selected model; it never uses the enhancement or legacy key. Each cold
translation reserves one additional request against the existing query RPM and
daily/monthly caps; no caps are raised automatically. Owner/model/prompt-scoped
translations are cached for 15 minutes (512 entries). Completed queries are also
cached before translation and identical concurrent requests share both provider
calls. Translation timeout/invalid output/model errors fall back to embedding the
original query (30-second result cache). Quota/Redis budget failures stay closed;
embedding/index failures use Post's metadata-only fallback unless
`requireSemantic=true`. A translation outage alone no longer disables image search.
The internal search deadline is 9 seconds; per-call application timeouts remain
bounded by `PROVIDER_TIMEOUT_SECONDS`. Generation sends the provider-required
10-second HTTP deadline while the shorter local application timeout still applies.
Set `QUERY_TRANSLATION_ENABLED=false` to roll back only query normalization;
image vectors/collections do not need reindexing. See
[query routing and fuzzy text](../docs/specs/moments/english-query-fuzzy-caption.md).

## Explicit live smoke

```powershell
.\.venv\Scripts\python.exe scripts/smoke_gemini.py --live
```

Exactly two requests: a synthetic red-square JPEG and a Vietnamese query. This
script does not access user photos and never prints a key or vector. It verifies
transport/vector shape only, not retrieval quality or latency targets. Exit codes:
0 pass, 1 provider failure, 2 missing key or missing explicit --live opt-in.
The initial smoke used the legacy paid key exactly twice, before the user clarified
it must not be used. After the user supplied and explicitly authorized the new
embedding-only key, a second two-call smoke passed. Authorized local activation
then passed an end-to-end image/query test with two further dedicated-key calls.
Total Gemini requests: legacy key 2, dedicated embedding key 4; no retry. Runtime never falls back
to legacy GEMINI_API_KEY or GOOGLE_API_KEY. No additional live calls are scheduled.

[Google embedding contract](https://ai.google.dev/gemini-api/docs/embeddings),
[official SDK](https://googleapis.github.io/python-genai/),
[service operations](../docs/specs/moments/operations.md).

## Image enhancement

`POST /ai/images/enhance` retains multipart `image` + `filterId` and binary response.
Filters: `handwritten_diary` (white diary overlay / short Vietnamese comments) and
`subject_sticker` (transparent PNG with white subject outline). Python does not
persist the generated image; upload results through Java Post to publish them.

Configure in ignored `ai-service/.env` (not root `.env`):

```dotenv
IMAGE_ENHANCEMENT_ENABLED=true
GEMINI_API_KEY=<existing-image-provider-key>
GEMINI_IMAGE_MODEL=<your-image-model>
AI_SERVICE_TOKEN=<same-service-token-used-by-Gateway-and-Post>
# Set deliberate caps for your provider/project; zero prevents provider calls.
GEMINI_ENHANCEMENT_RPM=3
GEMINI_ENHANCEMENT_DAILY_CAP=20
GEMINI_ENHANCEMENT_MONTHLY_CAP=100
```

These example caps are local application limits. Embedding uses its separate
`GEMINI_EMBEDDING_API_KEY`, flags and budgets. Either feature can be disabled
independently. Enhancement needs Redis for atomic budget reservations, but does
not need Qdrant readiness. Do not silently reuse the embedding key for images.
The old Nest process read root `.env`; copy the existing image model/key into
Python's local configuration during deployment. This migration does not edit or
print existing secret files.

Gateway `api-gateway/.env` needs `AI_SERVICE_URL=http://127.0.0.1:8087` and matching
`AI_SERVICE_TOKEN`. Client calls use Gateway (:8080), never the internal token.
The current MVP is public at Gateway with IP throttling; account authorization
is not implemented for this endpoint. Direct Python image requests require the
service token. Semantic `/internal/*` additionally requires Post's signed actor
capability; the Gateway rejects `/ai/internal/*`.

[OpenAPI](openapi.yaml) imports into Bruno with Gateway as the default server:
use Multipart Form, file `image`, text `filterId`, and a client timeout over 60s.
The Gateway adds the trusted credential. `GET http://localhost:8087/health` and
`/health/live` are free process checks, not provider verification.

Input defaults to 10 MiB, output 20 MiB, single-frame decoded limit 40 MP;
`AI_MAX_INPUT_BYTES`, `AI_MAX_OUTPUT_BYTES` and `AI_MAX_IMAGE_PIXELS` can lower
these limits. MIME must match decoded format. Sticker output must actually
contain transparency. Deadline `AI_REQUEST_TIMEOUT_MS` (max/default 60,000)
covers upload, multipart parsing, queueing and processing. Disconnect cancels
provider work; quota is not refunded after a potentially billable attempt.
Provider storage/streaming and SDK retries/continuations are disabled. Multipart
may use temporary spooled files, closed after the request; no business record or
persistent image is written by enhancement.

From root, `npm run start:ai`, `npm run dev:ai` and `npm run test:ai` use the Python
venv on Windows or Linux. The `moments` Compose profile already builds the same
Python image, so no second image runtime/container is required. Port 8082 is
retired. See [unified deployment guide](../docs/specs/unified-ai.md).
