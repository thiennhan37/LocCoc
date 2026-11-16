# Post S3 storage and authenticated publishing Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement task-by-task.

**Goal:** Store new post photos in SeaweedFS via S3, preserve old images, require authenticated publishing from mobile.
**Architecture:** PhotoStorage isolates S3; PhotoDecoder validates PNG independently. UserIdentityClient delegates JWT/account verification to user-service. Existing UserApiClient carries mobile session and refresh logic.
**Tech Stack:** Java 21, Spring Boot, AWS Java SDK v2, Flutter/Dart, Node migration CLI.
**Spec:** docs/superpowers/specs/2026-11-15-post-s3-storage-design.md

## Global constraints
- Keep /posts/media/{uuid}, database rows and source files unchanged.
- Private bucket; conditional puts; no local writes; only read fallback on missing S3 object.
- No secret changes or commits. User authorized implementation in current project.

## Review focus
- Collision or failed database commit must not delete somebody else's object.
- Storage permission/outage must not trigger local fallback.
- Forged owner/header or revoked session must not publish.
- Refresh and account switch must not publish as a different user.
- Migration rerun and differing remote bytes must preserve originals.

### Task 1: Storage and JWT backend
Files: post-service service/PhotoStorage.java, PhotoDecoder.java, S3PhotoStorage.java, UserIdentityClient.java; configuration/PhotoStorageConfiguration.java; PhotoPostService.java, PhotoPostController.java; pom.xml, application.properties; tests.
Interfaces: PhotoStorage.save(UUID, byte[], UUID owner, String caption): boolean created, read(UUID), discard(UUID); PhotoDecoder.decode(String); UserIdentityClient.resolve(String): UUID.
- [x] Add failing JWT HTTP tests (missing/invalid/expired/revoked, forged owner), run Maven targeted test; expect failure before implementation.
- [x] Add storage tests for conditional puts, bounded reads, errors, fallback and rollback; observe RED.
- [x] Implement SDK storage, decoder and JWT identity, retaining validation and idempotency; run Maven suite to GREEN.

### Task 2: Mobile authenticated upload
Files: PostApi, HomeScreen, CaptureMomentScreen, PhotoEditorScreen; post_upload_auth_test.dart and route tests.
Interface: PostApi(session: UserApiClient) publishes via session.request(area: posts).
- [x] Add tests verifying Bearer, one refresh with identical request, no-session refusal and account mismatch; observe RED.
- [x] Pass session from Home through capture/editor; retain retries and display auth errors; run analyzer and Flutter suite.

### Task 3: Safe migration and operational documentation
Files: scripts/migrate-post-media.mjs, scripts/lib/post-media-migration.mjs and tests; ADR-016, docs/specs/post-s3-storage.md, README, .env.example, PROJECT_CONTEXT.md.
Interface: migration dry-run/apply, SHA-256 remote verification, no overwrite/delete, private bucket provisioning.
- [x] Add failing migration tests for dry run, retry, conflict, verification, missing directory and symlinks; implement and run node --test.
- [x] Verify S3 against disposable SeaweedFS; inspect configured local sources without disclosing secrets, migrate when destination/source are verified.
- [x] Update docs, run relevant gateway checks and final fresh review; leave changes reviewable without push.

## Execution ledger
- Ruling: Work in the current api-gateway checkout to fulfill the requested project change; no new worktree or branch switch.
- Ruling: Preserve request ownerId for API compatibility but require it to match verified JWT identity; authoritative owner is server-resolved.
- Ruling: Use GET /users/me instead of loading the entire feed audience for publishing, retaining the same JWT/account verification authority.

- Final review: independent reviewer identified lost-PUT-ack retry failure. Added authenticated owner/content/caption metadata reconciliation; recovered objects are retained on database rollback. Regression test observed RED (missing interface), then unit tests passed; full real-S3 suite rerunning after Docker Desktop was stopped externally.
- Operations: user approved new ignored local credentials and persistent SeaweedFS. Migrated 10 images; dry-run after container restart returned identical=10, pending=0, failed=0. Source files retained; fallback disabled.

- Completed: backend full suite 32/32 including live SeaweedFS; Flutter 333/333 and analyzer clean; migration 7/7; Nest gateway 5/5; Spring gateway 21/21. Independent review finding resolved and verified. No commits/push performed; changes left in the current checkout for review.
