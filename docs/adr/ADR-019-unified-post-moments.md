# ADR-019: Java Post owns posts and private moments

Status: accepted, 2026-11-16.

The latest main Post feed, reactions and S3 implementation are the baseline. Port the Moments capabilities from `feature/smartly-seeking-moments`; do not merge its older Post implementation over main.

## Decision

Java `post-service` owns metadata, private gallery, feed access, images, search orchestration and durable indexing/erasure jobs. `/moments` remains a compatibility API backed by the same database. Existing social posts default to FRIENDS; gallery moments default to PRIVATE. All reads/mutations authenticate against IAM and media access uses the same current friend/block audience as feed. Python `ai-service` owns embeddings/Qdrant only; image transformation stays in `ai-enhancement-service`.

Upload intent is committed as a draft before S3 PUT. A database row lock serializes publication across instances. Failed/ambiguous activation never deletes a possibly committed object: retry reconciles the immutable payload, and expired drafts are tombstoned and queued for cleanup. Drafts cannot enter feed or search. S3 calls under this lock are bounded; AI runs only in the durable worker, never in request transactions. This deliberately trades a short database lock during bounded object I/O for a simpler, verifiable publication protocol.

Deletion first tombstones metadata and atomically enqueues independent object/vector erasure. Jobs use database locks to claim a 120-second lease, bounded calls outside database transactions, lease-token compare-and-set completion and persisted exponential retry; object erasure does not depend on AI availability. No second authoritative moments database remains after verified migration. Search always rehydrates current owner/state/version from Post before returning AI candidates.

## Migration and rollout

Keep source data intact. Provide a dry-run-first importer preserving IDs, ownership, timestamps, tags and asset versions, verifying images and rejecting collisions. Imported records are PRIVATE. Back up both databases, freeze legacy writes, apply migration, compare counts/checksums, then route `/moments` to Post. Never point Hibernate at the old Moments schema: equal table names do not imply equal schemas. No live data migration is implicitly performed by code changes.

## Verification

Test unauthenticated/spoofed writes, PRIVATE vs FRIENDS across media/feed/reactions, deleted/stale search hits, publication retries and failures, durable independent erasure and fallback search. Exercise the Java and Python protocol together using fake providers; run real PostgreSQL/S3 checks when those services are available. Mobile loads protected image bytes through its session client, including token refresh.

WebP decoding uses TwelveMonkeys ImageIO 3.15.0, whose [release notes](https://github.com/haraldk/TwelveMonkeys/releases/tag/twelvemonkeys-3.15.0) document WebP decoding and allocation fixes. EXIF orientation is applied before metadata is stripped.
