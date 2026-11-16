# LocCoc AI service

The single Python AI runtime, consolidated from the former experimental service.
Gemini Embedding 2 produces one 768-dimensional vector per JPEG or Vietnamese text
query. The vector space/profile is `gemini2-d768-imgv1-queryv1`; the collection is
`moments_gemini2_d768_v1`. No GPU, torch, transformers, model downloads, URL fetch,
public embeddings endpoint or legacy provider remains in the runtime.

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
with issuer `moment-service`, audience `loccoc-ai`, owner UUID and exact operation.
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
