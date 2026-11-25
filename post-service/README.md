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

## Feed pagination

`GET /posts/feed` sorts by capture time (falling back to creation time), newest first, independently of seen state. `ownerId` selects an authorized author and uses creation-time order with the `(owner_id, deleted_at, created_at DESC, id DESC)` index. Both paths enforce active state, current audience and visibility; private moments are visible only to their owner. Pages use bounded keyset cursors with a one-hour snapshot; author cursors are scoped to that owner.

## AI preview before publishing (2026-11-17)

- Mobile composer: **Sửa ảnh bằng AI** -> select diary/sticker -> explicitly generate
  -> compare by holding -> **Dùng ảnh này** -> publish normally. Restore original
  remains available. Every explicit generation shows the stated 2,000 VND API cost.
- Authenticated `POST /posts/photos/enhance` takes requestId (UUID), imageBase64
  (PNG <=5 MiB, <=2048 px), filterId. Returns imageBase64 and mimeType, no post/S3 write.
- `AI_SERVICE_URL` configures the internal AI origin (default http://127.0.0.1:8087).
  Gemini credentials/model stay in ai-service; no new provider API is required.
- Apply the additive `ai_preview_attempts` table/index from schema-postgresql.sql
  when Hibernate schema update is disabled. Attempts persist before the provider
  call. Duplicate IDs return 409, including failed/uncertain attempts; new explicit
  generation uses a new ID and can incur another fee. No automatic retry.
- Preview deadlines: provider client 65s, either Gateway 75s, mobile 90s. The normal
  publish path retains its existing behavior. Five attempts/user/minute per instance;
  multi-instance quota coordination is not included. Ledger contains no images.
- Test with mocks only. A successful mock proves protocol/flow, not real Gemini
  compatibility or visual quality. Canceling a preview cannot undo provider billing.
- Contract and decision: docs/specs/post-ai-preview.md, docs/adr/ADR-020-post-ai-preview.md.
