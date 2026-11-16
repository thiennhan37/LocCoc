# Ranked feed implementation plan

> Execute with superpowers:executing-plans; final independent review.

**Goal:** Scroll Home into own and accepted-friend posts, demoting viewed posts.
**Architecture:** Flutter feed -> post-service -> authenticated user-service audience; post DB stores views. Stable snapshot/keyset pagination.
**Tech Stack:** Flutter, existing HTTP client/session refresh, Spring/JPA/JDBC, Nest/TypeORM.
**Spec:** docs/specs/ranked-feed.md

## Constraints and review focus
- Preserve existing auth, Google login, profiles, friends, camera/editor and local photo APIs.
- No cross-database access, secrets changes, commits or deployment.
- Test rank ties, own old posts, seen writes during pagination, unfriend/block, expired cursors, missing token, offscreen/background view tracking and publish refresh.

## Tasks
- [x] Write failing HTTP feed contract tests; add authenticated audience API in user-service and test accepted-only membership.
- [x] Implement audience client, post_views, ranked query/cursor, GET feed and PUT seen; verify Spring tests.
- [x] Write mobile feed tests; add typed feed API/controller/widgets with visibility dwell, pagination, refresh and Home publish integration.
- [x] Verify gateway forwarding, update Postman/schema/readmes/context, run targeted and regression suites/build; independent review and fixes.

## Execution ledger
- User explicitly said implement proposal; no further design approval pending. Work in the current clean checkout so changes appear in the user's project. No local .agents rules/skills directory exists; follow AGENTS.md and established service patterns.

- Delivered server-ranked feed, authenticated live audience, first-view table, stable cursor and Home slivers.
- Verification: Flutter 123 tests; post-service 20 tests; feed contract 5 on isolated real PostgreSQL schema; accepted audience HTTP test on isolated real PostgreSQL schemas; Nest proxy4/Spring gateway20.
- Independent review fixed expired cursor recovery and brief scroll interruptions of dwell, both with regression tests. No services started outside test processes.
- Final verification: analyzer clean, 123 Flutter tests passed, Android debug APK built successfully.
