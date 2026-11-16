# Post S3 storage and JWT contract

See ADR-016 and the approved design in docs/superpowers/specs/2026-11-15-post-s3-storage-design.md.

- POST /posts/photos requires Authorization: Bearer JWT. Request shape remains requestId, ownerId, imageBase64, caption. Server compares ownerId with IAM-verified UUID and stores the verified UUID. Forged identity headers are ignored.
- Missing/rejected token: 401; owner mismatch or blocked account: 403; unavailable IAM/storage: 503; object/request conflict: 409. Input validation and 8 MiB body limit remain in effect.
- PNG limit 5 MiB, dimensions up to 2048; decoder strips metadata before storage. Keys: posts/{uuid}.png. Conditional creation prevents overwrite. Authenticated owner and content/caption SHA-256 metadata allow recovery of a lost PUT acknowledgment only for the identical request. Database failure removes only an object newly created by that call, never a reconciled object.
- GET /posts/media/{uuid} keeps existing database/deleted checks and returns image/png. Bucket is private; no new public bucket access. Existing API media-read policy is unchanged.
- POST_S3_ENDPOINT/REGION/BUCKET/PATH_STYLE/ACCESS_KEY/SECRET_KEY configure storage. MEDIA_S3 credentials are a local fallback; absent credentials use AWS default chain. Credential pairs must be complete. HTTP endpoints are for loopback/local development; use HTTPS for remote deployments.
- POST_LEGACY_READ_ENABLED defaults false. POST_MEDIA_DIR is read-only and consulted only for NoSuchKey. NoSuchBucket/AccessDenied/network errors fail closed.
- Migration CLI defaults dry-run, supports --apply and --create-bucket. It refuses public bucket policies/ACLs, verifies SHA-256, reports per-file results, preserves original files and rejects conflicting destination bytes.
- Mobile Home passes UserApiClient to capture/editor and PostApi. Upload cannot use anonymous transport; token refresh retries the same request once. Account invalidation is handled by the session coordinator.

Validation commands and setup are documented in post-service/README.md.
