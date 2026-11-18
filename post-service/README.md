# Java Post + private Moments

Search keeps the original query for accent-insensitive, typo-tolerant caption,
tag and place matching. Python normalizes only visual queries into English;
translation failures retain metadata-only search. See
[query routing](../docs/specs/moments/english-query-fuzzy-caption.md).

`post-service` is the sole owner of social posts, private gallery/search, S3 images and durable indexing/erasure jobs. Port **8089**. Both gateways forward `/posts` and `/moments` here; the Nest Moments runtime has been retired.

Start with [the deployment, migration and verification guide](../docs/specs/unified-post-moments.md) and [ADR-019](../docs/adr/ADR-019-unified-post-moments.md).

All create/delete/media/feed/reaction/gallery/search APIs require a live Bearer session. Social photo publication is FRIENDS; gallery uploads/imports are PRIVATE. `ownerId` in legacy requests is an assertion checked against IAM, never proof of identity. Deletion tombstones metadata immediately and durably schedules S3/vector erasure.

`POST /posts/photos` retains the stable `requestId` + base64 PNG contract. Database locking and committed upload intent make identical retries safe across service instances. `/moments` preserves the existing gallery API with JPEG/PNG/WebP upload (10 MiB input), normalized PNG display and JPEG embedding. AI disabled/unavailable gives metadata-only search unless semantic results are explicitly required.

See `.env.example` for configuration. Apply `schema-postgresql.sql` on a fresh database and `migrations/002-unified-moments.sql` before `POST_DB_DDL_AUTO=validate`. Do not use the legacy Moments database as Post's datasource.

Run `npm run start:post` from the repository root for local development. Its launcher fills missing semantic flag/service token/actor secret from the existing Python `.env`, without copying Gemini keys or changing files. Explicit Post settings still win. Direct Maven/IDE launches require those values in Post's own environment. An empty Qdrant index with unattempted pending jobs means visual search has not been enabled in Post.

Existing local PNG migration remains available via `node scripts/migrate-post-media.mjs` (dry run by default). Source legacy Moments data uses the separate `moment-import` profile documented in the guide. No migration runs automatically.

Postman: `postman/LocCoc IAM - API Gateway.postman_collection.json` remains the single collection.
