# ADR-016: S3-compatible post photos and authenticated publishing

Status: accepted, 2026-11-15.

## Decision
Store new post PNGs through PhotoStorage using AWS SDK Java v2 and the existing SeaweedFS S3 interface. Keep post metadata in PostgreSQL and stable /posts/media/{uuid} URLs. Use a private post bucket, conditional PutObject (If-None-Match: *), bounded reads/timeouts and rollback cleanup only after a successful new write. PhotoDecoder retains independent PNG validation/sanitization.

Require Bearer JWT on POST /posts/photos. Delegate verification to user-service GET /users/me, which uses the existing IAM account/session authority. Resolve owner on the server and reject a client ownerId mismatch. Do not trust forwarded identity headers. Mobile uses its current UserApiClient coordinator for refresh and account-lifetime checks.

## Legacy photos
Migrate UUID-named PNG files without rewriting bytes, overwriting differing objects or deleting sources. Compare SHA-256 after each copy and on repeat runs. Optional local fallback is read-only and applies only to missing objects, never to S3 authorization/network errors. Disable it after verified migration.

## Alternatives and consequences
Filer-specific APIs would couple storage to SeaweedFS. Public bucket URLs would change the client/API contract. Both are rejected in favor of standard S3 APIs and service-mediated reads.
Storage and DB do not share a transaction. Objects carry authenticated owner, photo checksum and caption checksum metadata; a retry after a lost PUT acknowledgment reconciles only matching metadata and bytes. Recovered objects are never deleted on rollback. Unmatched/pre-migration objects fail closed. The service preserves a single-process publication lock; distributed exactly-once publishing is not claimed.
user-service must be available for upload authentication. Legacy metadata/deletion endpoints and media-read access policy are outside this change.
