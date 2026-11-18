> Historical runtime document: the Nest Moments deployment is superseded by [Java Post/Moments](../unified-post-moments.md).

# Smart moments: configuration, API and recovery

Date: 2026-11-14. Runtime decisions: [ADR-016](../../adr/ADR-016-unified-ai-and-moment-runtime.md).
Evidence and remaining gates: [report](reports/2026-11-14-runtime.md).

## 1. Local activation

`node scripts/configure-moments-local.mjs` previews the exact local resource and
configuration changes without writing files or calling Gemini. Review its output
and source before authorizing `--apply`. The helper refuses nonlocal endpoints,
keeps existing keys, creates distinct new service credentials, provisions only a
separate moment database/private bucket and keeps flags off until setup succeeds.
It uses existing development storage credentials unless dedicated ones are supplied;
production needs bucket-scoped credentials. Applying was subsequently authorized
and completed successfully on this local environment.

This environment now has a separate moment DB/private bucket and the two service
flags enabled. Existing Gemini/Auth/storage key values were retained. Only new
service credentials/configuration were written in the two ignored service env files.
An initial synthetic smoke used the existing legacy `GEMINI_API_KEY` exactly twice
(one image, one text, no retry). The user clarified this key is paid and prohibited
its use. Runtime now exclusively requires **`GEMINI_EMBEDDING_API_KEY`**; it has
no fallback to `GEMINI_API_KEY` or `GOOGLE_API_KEY`. The user subsequently filled
and authorized the new field; its own two-request smoke passed. Exact total:
legacy paid key 2 requests, dedicated key 4 requests (two smoke + two local E2E),
no retries. Billing amounts are unknown. The setup steps below document what has
now been applied locally and how to reproduce it elsewhere:

1. Independent PostgreSQL database `moments`, role `moment_service`, and its own
   password. New Compose volumes can use optional `MOMENT_DB_PASSWORD` in root
   `.env`; existing volumes require explicit additive provisioning. Never reset
   `postgres_data` to run initialization scripts.
2. `moment-service/.env`: `MOMENT_DATABASE_URL`, the existing AuthService origin/
   internal token and public-key **path**, private storage settings and flags.
   Database URL points to its own database, not accounts/users. For host execution
   public-key path is `../secrets/jwt-public.pem` relative to moment-service cwd;
   in Compose use `/run/secrets/jwt-public.pem`.
3. A new private bucket such as `loccoc-moments-private`. Use dedicated bucket-
   scoped credentials with Get/Put/DeleteObject and required bucket inspection
   permissions. Do not use the public profile bucket or its anonymous-read policy.
   `node scripts/configure-moment-storage.mjs` creates a missing configured bucket,
   refuses anonymous Allow/ACL grants and probes anonymous read/list. It never
   rewrites an existing policy. Run it only after selecting the intended endpoint
   and credentials; it creates and removes a synthetic privacy probe object.
4. Generate two **different new** random >=32-character values for
   `AI_SERVICE_TOKEN`/`AI_ACTOR_SECRET`; match them in both service environments.
   Keep these separate from AuthService's `INTERNAL_SERVICE_TOKEN`. Do not put
   provider/service credentials in Flutter, Git, URLs, diagnostics or chat.
5. `ai-service/.env`: dedicated `GEMINI_EMBEDDING_API_KEY`, Qdrant/Redis origins, optional
   Qdrant API key and service credentials. Choose conservative nonzero
   `GEMINI_QUERY_RPM`, `GEMINI_INGEST_RPM`, `GEMINI_DAILY_REQUEST_CAP` and
   `GEMINI_MONTHLY_REQUEST_CAP` according to the actual free project quota.
   The defaults of zero deliberately permit no provider requests. Owner searches
   additionally have `AI_OWNER_SEARCH_RPM` (default 30), including cache hits.
   Configure Google-side project quotas too; app request caps are not a USD ledger.
6. Build common/MomentService and apply the additive migration. Start AI on
   127.0.0.1:8087 and MomentService on 127.0.0.1:8088. Both gateways use
   `MOMENT_SERVICE_URL=http://127.0.0.1:8088` by default. There is no public `/ai`.
7. Set `MOMENTS_ENABLED=true` in MomentService, `SEMANTIC_SEARCH_ENABLED=true`
   in both backends only after setup. Flutter opt-in: `flutter run
   --dart-define=MOMENTS_ENABLED=true`. Existing builds retain preview behavior.
   The feature notice explains that processed photos/queries go to Google.

Current local launch: `./scripts/start-moments-local.ps1` starts missing Auth,
Gateway, AI and Moments processes in hidden windows, preserving ports already
in use. PIDs/logs are under `logs/moments-local/`. Current ports: 8000/8080/8087/8088;
the existing UserService on 8081 remains running. Authenticated live verification
is `node scripts/verify-moments-local-live.mjs --live` (max two extra provider
reservations, synthetic accounts/image, no automatic retry by the runner).
Its first run passed every check and consumed exactly two requests. Fixtures are
tombstoned and photo/vector cleanup completes. Do not rerun it just as a health
probe: it explicitly calls Gemini. Android APK was built with Moments enabled at
`MobileApp/build/app/outputs/flutter-apk/app-debug.apk`; no device installation was performed.

The optional Compose `moments` profile supplies AI/MomentService containers, but
service-local origins/DB URL/storage URL must be valid **inside** containers. Use
`db:5432`, the private storage's container DNS name/port, and the mounted key path.
The profile does not initialize an existing database volume or create a bucket.
Default host operation is simpler when Auth/User services already run on Windows.

## 2. Public API (both gateways)

All requests require the existing RS256 access token and a current active account.
Unknown DTO fields are rejected; owner IDs, storage keys and raw filters are not
accepted. Direct MomentService access enforces the same JWT/authority checks.

| Method/path | Request/behavior |
| --- | --- |
| POST `/moments` | caption <=1000 chars, <=20 tags <=50 chars, optional capturedAt/albumId/place; returns server IDs, draft |
| PUT `/moments/{id}/image` | Raw JPEG/PNG/WebP <=10 MiB; immutable upload, active + pending job committed together |
| GET `/moments?limit=20&cursor=...` | Owner-only keyset gallery (drafts included); limit 1–50 |
| GET `/moments/{id}` | Owner-only current metadata/index state |
| GET `/moments/{id}/image` | Authenticated read-through, rechecks lifecycle after object I/O; private/no-store |
| POST `/moments/search` | query 1–500 NFC chars, limit 1–50, optional albumId/place/dateFrom/dateTo/requireSemantic |
| POST `/moments/{id}/retry-index` | Resets a failed active index job; does not upload or create a new moment |
| DELETE `/moments/{id}` | Transactional tombstone + cleanup job; clears caption/tags/place and blocks reads immediately |

Authenticated image reads intentionally replace the proposed presigned URLs for
this MVP. There is no bearer credential in a URL or anonymous image origin; each
GET uses current account/lifecycle authority. Already downloaded bytes cannot be
revoked. No public originals are stored. The processed JPEG keeps aspect ratio,
applies orientation and strips metadata, with 1536 maximum axes and a 2 MiB cap.

Search supports explicit inclusive date boundaries, case-insensitive exact place,
and album UUID filters (album management/sharing is not implemented). A constrained
Vietnamese parser understands hôm nay/hôm qua/năm nay/năm ngoái/năm YYYY/tháng N
năm YYYY/tháng N/YYYY using UTC+7 calendar boundaries. Explicit date filters take
precedence. The server returns the actual `appliedFilters`; no LLM guesses dates,
locations or identities. Metadata candidates use PostgreSQL simple text search;
semantic candidates are owner/profile filtered in Qdrant. RRF merges ranks, then
fresh PostgreSQL owner/state/version/filters decide results. A bounded top-200
candidate window is not exhaustive pagination of semantic results.

Provider/Qdrant failures return `mode=metadata_only`, `semanticStatus=unavailable`;
`requireSemantic=true` returns 503. Metadata authority failures are errors, never
empty success. Flutter shows pending/failed/fallback/empty/error and fences late
JSON/image responses after account replacement. An uncertain create is not
automatically replayed; gallery drafts allow inspection/deletion. An uncertain
upload retries only the same draft ID, with immutable activation semantics.

## 3. Durable indexing/deletion

PostgreSQL `moment_jobs` is a transactional outbox/work queue. Polling uses
SKIP LOCKED and UUID leases (60s); completion compares lease/state/version.
Per-moment session advisory locks serialize index/delete across workers. Immutable
object keys + SHA-256 checks protect the worker manifest. Owner/asset/version/
profile generate deterministic point IDs. Retries max out at five attempts;
backoff includes jitter and honors safe upstream Retry-After. Failed jobs remain
available for inspection/replay. A crash after provider acceptance may cause a
second billed call: neither the outbox nor point IDs guarantee billing exactly-once.

Delete revokes final authority before external cleanup. Index results finishing
after deletion cannot appear; stale lease completions remove their vector while
holding the same per-moment lock. Failed deletion cleanup remains in the job table.
Staged objects are registered before PUT and cleaned after one hour if unreferenced.
When semantic processing is disabled, private object cleanup continues and vector
jobs wait without consuming their attempts. Account-deleted events are consumed
from existing Kafka `account.events`, projected terminally and create cleanup jobs;
active/replayed events cannot revive a deleted account's moments.

Operator diagnostics (run only on moment_db; no photo/query/secret dumps):

```sql
SELECT operation,status,count(*),min(created_at) FROM moment_jobs GROUP BY operation,status;
SELECT error_code,count(*) FROM moment_jobs WHERE status='failed' GROUP BY error_code;
```

To replay a reviewed failed cleanup job, bind its UUID and transactionally update
only `status='failed'` to pending, attempts=0, available_at=now(), lease=NULL,
lease_until=NULL. For a failed index also reset the **active matching version's**
index_status to pending. The public retry endpoint already performs this for the
current owner's active image. Do not replay running leases or delete metadata to
hide failed jobs. No destructive Qdrant migration/old-point ownership import is
performed: upload authorized source images again to build the new profile.

## 4. Health, tests and rollback

AI process liveness never calls Google. Internal readiness checks collection shape/
cosine/payload indexes and Redis; provider must have succeeded within five minutes.
An explicit signed `health` actor can call `/internal/canary`, which bypasses the
query cache and reserves a single provider request. No canary scheduler is enabled
by default; plan its request budget before scheduling. A stale provider canary
makes semantic readiness 503 without restarting a healthy metadata process.

```powershell
pnpm --filter @loccoc/common build
pnpm --filter moment-service build
pnpm --filter moment-service test
node scripts/verify-moments.mjs
cd ai-service
.\.venv\Scripts\python.exe -m pytest -q
```

The runner uses random loopback ports, unique disposable containers, synthetic
images and a deterministic provider; it removes only containers it created.
Separate live smoke requires fresh authorization and `scripts/smoke_gemini.py --live`
from ai-service (two real requests using only the dedicated embedding key).
Unit/integration success is not a live quality/load/restore gate. Do not publish
100k-vector/C=20 or p95/p99 claims until those workloads are measured.

Rollback: disable semantic in MomentService and retain authenticated metadata
search; disable Flutter/server moments flags if necessary. Preserve PostgreSQL,
private storage and the versioned collection for recovery. Do not restore legacy
AI endpoints, reset volumes, mix vector profiles or import untrusted old owners.
Private-data/free-tier suitability, production TLS/scoped credentials, drift/
blue-green reindex, automated reconciliation/restore and quality/load gates remain
separate rollout work; see the report for precise status.
