# Post media on SeaweedFS through S3

Status: approved; extended by user to require JWT on photo publishing and Bearer tokens from MobileApp.

## Intent and scope

Replace post-service disk writes with S3-compatible object storage on the existing SeaweedFS deployment. Preserve existing images and post URLs. PostgreSQL continues to own post metadata. The user explicitly requires keeping old images.

## Approaches

- Recommended: S3 API with a storage interface, private post bucket, and a migration command. This works with SeaweedFS now and AWS S3 later.
- SeaweedFS Filer API would require another adapter when moving to S3; it does not fit the requested portability.

## Design

- Separate PNG validation/sanitization from storage. Preserve the existing size limits, request IDs, duplicate-request checks and rollback cleanup.
- Use AWS SDK for Java v2 behind a photo storage interface. Configure endpoint, region, bucket, credentials and path-style addressing externally. Allow the AWS default credential chain for future deployment. Do not change committed or local secrets.
- Store objects as `posts/{uuid}.png` in a private bucket separate from the existing public profile-media bucket. Retain `/posts/media/{uuid}` in database records and API responses; the service reads objects after the existing database/deletion checks. No mobile or gateway route change is required.
- New uploads write only to S3. Conditional object creation must reject collisions; cleanup must never remove a pre-existing object. Bound SDK timeouts and map missing objects, conflicts and storage outages to the existing API errors.
- During migration, allow explicitly configured read-only fallback to the old POST_MEDIA_DIR, only when S3 reports the object missing. Never mask S3 access/connection failures with fallback. Keep local files intact.
- Provide a migration command with dry-run and apply modes. Read UUID-named regular PNG files from an explicitly selected legacy directory; do not follow symlinks or modify sources. Upload original bytes, verify downloaded bytes by SHA-256, and record per-file outcomes. Skip identical existing objects; report differing objects without overwriting. A rerun resumes safely. Report missing source directories and failures clearly with a failing exit status.
- After migration verification, disable fallback. Future S3 migration copies the same keys and changes storage configuration, leaving post IDs and URLs intact.

## Verification and delivery

- Unit/API tests cover upload, download, retry, collision, missing object, outage, rollback, and legacy fallback.
- Migration tests cover dry-run, identical retry, conflicting target, byte verification and preservation of source files.
- Run post-service Maven tests and an S3 integration check against disposable SeaweedFS storage if available. Any live migration requires a verified configured source and destination; never invent credentials.
- Add an ADR and technical spec; update post-service README, environment examples and PROJECT_CONTEXT.md with setup, migration and AWS S3 switching instructions.

## Builder decisions

The private bucket, stable object prefix, temporary read-only fallback and checksum verification are proposed implementation choices. This change does not redesign authentication, deletion retention, the upload API or the database schema.

## Approved authentication extension

POST /posts/photos requires a Bearer JWT verified by the existing user-service account/session guard through GET /users/me. Resolve the authenticated UUID server-side; reject a mismatching ownerId with 403. Missing/invalid/expired/revoked tokens fail closed. Mobile publishing uses the existing UserApiClient session coordinator, including one refresh on 401 and protection against account replacement.
