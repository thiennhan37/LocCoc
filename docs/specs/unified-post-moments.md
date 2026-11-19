# Unified Post/Moments implementation

Java Post remains the public media authority on port 8089. Python AI on 8087 provides internal embeddings/search and the image enhancement module. No Nest Moments process is required.

- Keep `/posts/photos`, `/posts/feed`, seen and reaction contracts. Authenticate legacy create/delete and media reads. Owner IDs from old clients are assertions, never credentials.
- Preserve `/moments` create/list/get/image/delete/retry-index/search contracts. Gallery data is private; social photo publication remains FRIENDS. PNG is canonical display storage; JPEG is derived for the embedding protocol.
- Persist draft/active state, visibility, captured time, tags, album/place, asset ID/version, indexing status, immutable upload hash and durable jobs in the Post database. Existing rows backfill ACTIVE/FRIENDS; legacy private data is imported explicitly.
- Search bounds inputs and candidates, combines metadata and vector ranking, then checks current ownership/state/version. AI disabled/unavailable returns metadata_only unless requireSemantic is true.
- Visual queries are normalized to English in Python before embedding; Post fuzzy-matches original-language caption/tags/place. Translation is cached and consumes existing provider budgets. See [English query/fuzzy caption](moments/english-query-fuzzy-caption.md) and ADR-022. No image reindexing or public route change is required.
- Durable worker retries index and delete independently. Retain tombstones; expired drafts enter cleanup. Multi-instance publication uses a database lock, never a JVM monitor.
- Gateway forwards both route families to Post and strips internal AI capability headers. It never exposes Python internal endpoints.
- Update Flutter gallery integration and authenticated image loading; preserve camera/feed behavior.
- The Home Memories tab follows `/moments` pagination: retain `nextCursor`, append/deduplicate the next page through “Xem thêm kỷ niệm”, and keep loaded photos/cursor when a later page fails so it can be retried. Pull-to-refresh starts again at the first page. The displayed count is the number currently loaded, not a server total.

Deployment sequence: additive schema migration and backup; deploy Post/AI; verify isolated endpoints; dry-run and apply legacy importer with writes frozen; switch gateway/mobile; retire legacy Moment runtime. Existing user data is not deleted during development.

## Running the unified services

1. Stop the old Nest Moments process. Build with `mvn -f post-service/pom.xml package` and `pnpm build`.
2. Provision the dedicated private `loccoc-posts` bucket using the existing Post storage setup. Never reuse the public profile-media bucket. PostgreSQL `posts` is the destination, not the legacy `moments` database.
3. Back up Post DB, then run `post-service/schema-postgresql.sql` (new DB only) and `post-service/migrations/002-unified-moments.sql`. The additive migration can be rerun. Use `POST_DB_DDL_AUTO=validate` after migration. It preserves old social posts as FRIENDS and queues their managed images for indexing/erasure. `ddl-auto=update` is only a development convenience and does not replace this data backfill.
4. Configure `post-service/.env` using its example. Reuse the existing AI service token/actor secret values in Post and Python through environment configuration; no secrets are committed. Java's `POST_AI_SERVICE_URL` points at Python (:8087), and Gateway `AI_SERVICE_URL` now uses the same Python origin (:8087). Configure matching `AI_SERVICE_TOKEN` in Gateway; it injects the token for `/ai/images/enhance`. Image generation has its own enable flag and budgets; see [unified AI](unified-ai.md).
5. Deploy Post and Python together: internal capability issuer is now `post-service`. Python rejects the retired `moment-service` issuer. With `SEMANTIC_SEARCH_ENABLED=false`, metadata search works and pending indexing/deletion stays queued; private image cleanup continues independently.
6. Start `npm run start:post`. The local launcher inherits only missing `SEMANTIC_SEARCH_ENABLED`, `AI_SERVICE_TOKEN`, `AI_ACTOR_SECRET` and `EMBEDDING_DIM` from `ai-service/.env`; explicit Post configuration/process environment takes precedence, including `false` or blank values. Provider keys and budgets are not copied. This also applies to `scripts/start-moments-local.ps1` (built jar). Local Maven/IDE launches use the same defaults through a Spring environment postprocessor; production profiles or `post.local-ai-config-enabled=false` disable this convenience. Compose/production must configure the protocol values explicitly. Both gateways route `/posts` and `/moments` using `POST_SERVICE_URL=http://127.0.0.1:8089`; obsolete MOMENT_SERVICE_URL is ignored. The optional Compose `moments` profile runs Java Post + Python AI, not Nest Moments. IAM/user-service must be reachable for live account/friend checks. Enable the media profile as needed.
7. Flutter uses the same `/moments` contract and feature flag `--dart-define=MOMENTS_ENABLED=true`. Deploy the updated mobile client with the backend because image GETs now require Bearer auth. Normal feed image reads refresh the session once on 401 and reject late responses from departed sessions.

## Importing existing private Moments

Freeze legacy writes and keep both source DB/bucket intact throughout verification. Run the importer before restarting the Post workers. This is an explicit operator command, not an application startup side effect.

Set the destination's usual Post environment variables, and these source-only variables in the process environment:

- `MOMENT_IMPORT_DB_URL=jdbc:postgresql://.../moments`, `MOMENT_IMPORT_DB_USER`, `MOMENT_IMPORT_DB_PASSWORD` (read-only source role recommended).
- `MOMENT_IMPORT_S3_ENDPOINT`, `MOMENT_IMPORT_S3_REGION`, `MOMENT_IMPORT_S3_BUCKET`, `MOMENT_IMPORT_S3_ACCESS_KEY`, `MOMENT_IMPORT_S3_SECRET_KEY` (GetObject-only source credentials).

After building the jar:

```powershell
# Default dry run: verifies every source image checksum and checks destination ID collisions.
java -jar post-service/target/post-service-0.0.1-SNAPSHOT.jar --spring.profiles.active=moment-import
# Apply only after reviewing the dry-run summary and backups.
java -jar post-service/target/post-service-0.0.1-SNAPSHOT.jar --spring.profiles.active=moment-import --post.import.apply=true
# Run the dry run again; active images should report identical.
```

The importer preserves post IDs, original asset IDs/versions, owner, created/captured timestamps, caption, tags, album/place and tombstones. Imported active images become PRIVATE; they are normalized to PNG, verified after copying and reindexed using a derived JPEG. It never overwrites conflicting destination IDs, resurrects deleted destination rows, or deletes source objects. Partial imports can be retried: a committed draft records the original source fingerprint before object PUT. Existing source vectors are not trusted until indexing becomes ready. Old drafts older than 24 hours expire when workers resume.

Compare source/destination active/deleted counts, checksums and ownership, exercise a private read/search/delete through gateway, and retain source backups for rollback. Rollback before reopening writes is restoring the old gateway target and old binaries/config; after new writes, reconcile those records before rolling back. Historical Nest source remains in Git at the merge commit immediately before this unification.

## Operations

Embedding dimensions are configurable with `EMBEDDING_DIM=768|1536|3072` in both
Post and Python (the local Post launcher inherits a missing value from Python).
Python derives `gemini2-d{dim}-imgv1-queryv1` and
`moments_gemini2_d{dim}_v1`; explicit profile/collection values must match. Returned
vector shape, readiness and Java's response profile validation use the selected
dimension. Selecting another dimension requires reindexing/backfill into its own
collection: a database `ready` value does not prove membership in the new index.
Keep the previous collection for rollback; never overwrite a collection schema.

Vietnamese prompt dates additionally support `tuần trước`, `tuần này`, `tháng trước`,
`tháng này`, `ngày 15/10/2026`, and `từ ngày 01/10/2026 đến ngày 31/10/2026`.
Weeks start Monday, days use +07; prompt dates are removed before semantic lookup.
Invalid dates or multiple competing prompt intervals return validation errors.
Explicit UI date filters retain their existing precedence over prompt parsing.

- `post_media_jobs`: inspect `operation`, `attempts`, `available_at`, `done`, `lease_until`. Lease duration 120s; calls are bounded. No image bytes, credentials or raw provider errors are stored in jobs.
- Index failure retries with exponential backoff (maximum 1 hour), stops after eight failures, and exposes `indexStatus=failed`; owner can POST `/moments/{id}/retry-index`. Disabled semantic mode defers jobs without burning attempts.
- If visual searches return no matches, inspect `mode`/`semanticStatus` in the search response, Post's semantic flag, job attempts and Qdrant point count. Images in PostgreSQL alone are insufficient: `pending` jobs with zero attempts plus an empty Qdrant collection indicate that indexing has not run. Metadata fallback cannot recognize an animal absent from the caption/tags/place. After restoring matching configuration, pending jobs resume without reuploading images; quota-limited retries may take several minutes.
- Erasure retries indefinitely with a 1-hour backoff cap. The S3 job is independent of vector erasure. If deletion races with an in-flight index, completion or lease recovery schedules another vector erasure. Deleted metadata never re-enters reads/search.
- Draft upload intents expire after 24 hours; cleanup is durable. A failed S3 PUT/DB activation is retryable using the same request/image; differing bytes or caption conflict. Do not delete a stored object in the request's rollback handler.
- Account deletion events use Kafka group `post-service-accounts-v1`, replay from earliest on first deployment, validate event identity/version, and persist a deletion fence. Invalid events are not acknowledged; fix/replay them operationally. IAM is always the authority for live access.
- Limits default to 1,000 live records per owner and 30 new intents/hour, configurable via `MOMENTS_MAX_PER_OWNER` and `MOMENTS_UPLOADS_PER_HOUR`. Existing upload retries do not consume another quota.

## Verification commands

```powershell
mvn -f post-service/pom.xml test
node scripts/verify-moments.mjs
pnpm --filter api-gateway test:e2e
mvn -f api-gateway-spring/pom.xml test
cd MobileApp
flutter analyze
flutter test
```

The isolated verifier creates fresh PostgreSQL/SeaweedFS/Redis/Qdrant containers, applies the production migration twice, runs real S3 conditional-write and PostgreSQL concurrency tests, and exercises Java capabilities through Python with a deterministic provider. It makes no paid Gemini requests and removes only its own containers.

## Single Compose entry point (2026-11-17)

Use only root `compose.yaml`; the duplicate standalone media/Neo4j Compose files
were removed. Existing service names, pinned images, published ports and volume
keys `media_data` / `neo4j_data` are retained. Run with the same Compose project
name and Docker context to reuse the existing data.

```powershell
# Root .env must contain the required infrastructure configuration.
docker compose --profile media up -d media-store neo4j
# If local media credentials are in the additional ignored file:
docker compose --env-file .env --env-file .env.post-media.local --profile media up -d media-store
# Java Post + Python AI and their infrastructure, including S3:
docker compose --profile moments up -d --build
```

The `moments` profile automatically enables `media-store`; Post depends on its
startup. A separate Nest Moments container is unnecessary. No volumes or running
containers are removed by this configuration cleanup. Legacy local Moments
configuration/build files are archived under ignored `logs/retired-moment-service-*`
for recovery and are not used by the new runtime.
