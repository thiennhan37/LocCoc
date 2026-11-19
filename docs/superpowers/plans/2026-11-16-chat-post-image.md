# Post image chat implementation plan

> **For agentic workers:** Use executing-plans or subagent-driven-development; preserve existing changes and do not commit.

**Goal:** Persist and display a post image with a direct reply.
**Architecture:** Mobile sends optional postId; chat-service validates it through JWT-protected post-service and stores stable metadata in its own database. Existing history/realtime carry the same metadata.
**Tech Stack:** Flutter, NestJS/PostgreSQL, Spring Boot.
**Spec:** docs/superpowers/specs/2026-11-16-chat-post-image-design.md (approved by user).

## Global constraints
No arbitrary image URLs, no cross-database access, no secret changes, no automatic send on opening chat. Preserve existing text chat and photos.

## Review focus
Retry must preserve post context; different attachment with reused clientMessageId conflicts. Expired/missing media displays fallback. Wrong author or invisible/deleted posts must fail. Composer clears context after queueing first message. Old messages remain readable.

## Contracts
GET /posts/{id}/chat-reference with Authorization returns {postId, ownerId, mediaKey}; checks current audience and deletion. mediaKey is /posts/media/{UUID}.
Chat send accepts optional postId UUID. ChatMessage gains optional/null postAttachment: {postId, mediaKey}. All HTTP/realtime/history responses share this shape. Backend validates ownerId equals conversation peer.

## Tasks
- [x] Post-service: add failing API tests, implement ChatPostReference DTO/service/controller using existing FeedAudienceClient, verify Maven tests. Own/deleted/invisible posts cannot be used for peer replies.
- [x] Chat-service: tests for attachment validation, persistence/history, retries and conflicts; additive messages.post_attachment jsonb migration; POST_SERVICE_URL default http://127.0.0.1:8087; upstream JWT verification; include postAttachment in history/lastMessage/events; build and test, update OpenAPI and README.
- [x] Mobile: failing tests for post context send and roundtrip/history; extend models/repository/controller preserving attachment on optimistic/retry messages; preview and attachment bubble component uses trusted gateway origin; Home passes context; clear pending preview after first queued message; run Flutter tests/analyze.
- [ ] Integration: review diffs, run relevant verification sequentially for memory pressure; apply additive local chat migration if configuration available without editing secrets; update PROJECT_CONTEXT and report exact test evidence.

## Integration finding
Spring gateway lacked /chat routing although mobile sends REST through that origin. Add /chat and /chat/** with CHAT_SERVICE_URL default 127.0.0.1:8083 and verify body/JWT/query forwarding. This is required for the user’s stated Spring gateway configuration.

Verification completed: post-service 41 passed/1 skipped; chat unit 24 and integration 28 passed; Spring gateway 23 passed; Flutter full suite 349 passed. Local chat DB/.env missing; setup awaits explicit secrets authorization (asked asynchronously).

Local database follow-up complete: user supplied .env and authorized adding missing tables. Created absent role/database with existing credentials, ran both migrations and verified pendingMigrations=false. No .env modifications.
