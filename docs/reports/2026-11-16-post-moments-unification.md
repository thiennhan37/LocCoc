# Java Post/Moments unification verification — 2026-11-16

Branch: `feature/smartly-seeking-moments`. Main `01aefa1` merged as `b264cd6` before implementation. Five merge conflicts resolved while preserving the feature gallery, latest Post feed/reactions/S3 and the single retained Postman collection. Main's three newer feed requests make that collection contain 65 requests now; no second collection was reintroduced.

## Delivered behavior

- Java Post (:8089) owns `/posts` and `/moments`; Nest Moments is removed from tracked source, workspace and Compose runtime. Python AI remains :8087; enhancement remains :8082.
- Bearer identity is required for legacy create/delete and image reads. PRIVATE gallery images cannot be read through friend media/feed/reactions/search. FRIENDS media uses current IAM audience/block checks and rechecks after object I/O.
- Publication commits immutable draft intent before S3, locks database rows across instances, reconciles identical retries and never deletes a possibly committed object after an ambiguous DB activation. Expired drafts enter durable cleanup.
- Search preserves metadata fallback, bounded hybrid ranking, Vietnamese UTC+7 calendar phrases, filters and final current owner/state/version hydration. JPEG/PNG/WebP uploads normalize to PNG; JPEG derivatives feed AI. EXIF orientation is applied and metadata stripped.
- Durable jobs use 120-second leases and token checks, with network calls outside DB transactions. S3 cleanup does not depend on AI. A late index completion after deletion requeues vector erasure. Index retries are bounded; erasure retries persist. Kafka deletion events fence late writes and enqueue cleanup.
- Flutter protected image loading uses the session client with one refresh and rejects late responses from a departed session. Camera, gallery and feed behavior are retained.
- Additive SQL and a dry-run-first legacy importer preserve IDs, ownership, timestamps, metadata, private visibility, original asset identities and tombstones. Source data is never deleted.

## Verification performed

| Check | Result |
| --- | --- |
| Java Post Maven package + tests | 51 passed; 2 external-integration tests skipped in the default suite, exercised separately below |
| Isolated PostgreSQL 17 / SeaweedFS / Redis / Qdrant / Python fixture | PASS: 9 adversarial Post tests on PostgreSQL + real private S3 conditional-write test + Java-to-Python capability/index/search/delete test; Redis atomic quota contract also passed |
| Production SQL migration | Applied twice successfully on disposable PostgreSQL; Hibernate validate passed |
| Python AI | 33 passed; Ruff passed |
| Nest gateway | Build passed; 50 E2E tests passed |
| Spring gateway | 23 tests passed |
| Flutter | Full suite 352 passed; 9 targeted tests passed after final transport cleanup, including the additional protected-image refresh test; analyzer clean |
| Existing local PNG→S3 migration | 7 passed |
| Compose and Git | Compose configuration valid; no unresolved merge markers; diff check clean |

Additional regressions cover failed activation recovery, parallel identical publication, metadata-only fallback/cursors, stale/foreign semantic hits, deletion during in-flight indexing, account deletion fences, importer dry run/collisions/checksums/deleted accounts, calendar filters and EXIF rotation. All isolated verifier containers were removed after completion.

Logs are ignored under `logs/post-unification-*`. Test-generated credentials are disposable; no real secrets were edited or committed.

## Deployment boundary

No personal database/bucket was migrated or deleted; no paid Gemini request was made. Kafka event validation/application is tested, but the live broker delivery path was not exercised by the isolated verifier. The new Docker image definition was configuration-reviewed; the Maven jar was built locally. Apply the additive migration, review importer dry-run output, deploy coordinated Post/Python/mobile versions, then verify the actual environment using the [deployment guide](../specs/unified-post-moments.md). Keep source backups and freeze legacy writes during import. Ignored legacy local configuration/build files may remain on disk for recovery; they are no longer part of the deployed service.
