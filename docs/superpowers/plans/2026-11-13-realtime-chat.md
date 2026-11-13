# Authenticated Realtime Chat Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Deliver persisted 1–1 text chat with authenticated HTTP/socket transport, three Flutter screens and a two-emulator runbook.

**Architecture:** Chat Service owns PostgreSQL data and validates real IAM sessions through AccountAuthorityClient. REST writes are idempotent; Socket.IO delivers post-commit events, with HTTP history/detail resync on reconnect. Nest gateway proxies `/chat/*`; socket connects directly to Chat Service during local development.

**Tech Stack:** NestJS 12, TypeScript, TypeORM/PostgreSQL, Socket.IO 4, Flutter/Dart, Vitest/Supertest, Flutter tests.

**Spec:** [Approved design](../../specs/chat/realtime-chat-design.md), [ADR](../../adr/ADR-012-realtime-chat.md).

## Global Constraints

- Work on local `chat-service`, preserve the user's two pre-existing Flutter edits and all main authentication behavior.
- Port 8083; per-service env; database `chat`/role `chat_service`; migrations, never synchronize or delete existing volumes.
- Real Bearer sessions only, no caller-controlled sender or room; friendship/blocks checked using User Service.
- 1–2000 Unicode code points; messages use UUID client IDs, decimal-string sequences and server timestamps.
- 30 sends/minute/account, five sockets/account, one typing update/second/socket; one instance, in-memory quota reset on restart documented.
- Three screens: inbox, friend chooser, conversation. No group/file/voice/push/background delivery in this iteration.

## Review Focus

- POST response and socket event arriving in either order must produce one bubble (Task 4).
- Retry after committed-but-unacknowledged request must reuse ID without another row (Tasks 1/2/4).
- Revoked receiver and switched mobile account must never receive old-session content (Tasks 3/4).
- Missed read events and multiple pages of missed messages must recover via HTTP without regressing cursors (Tasks 2/4).
- Block/unfriend and dependency failure must fail closed for new interactions while participant history remains readable (Tasks 2/3).

### Task 1: Persistence and runnable service

**Files:** `chat-service/package.json`, `tsconfig*.json`, `vitest*.ts`, `src/config.ts`, `src/database/{database.module,migrate}.ts`, `src/database/migrations/1794528000000-CreateChat.ts`, `src/chat/{chat.types,chat.repository}.ts`, `test/chat.postgres.e2e-spec.ts`; root workspace/scripts and Docker init.

**Interfaces:** `ChatRepository` exposes `openDirect(accountId, peerId)`, `member(accountId, conversationId)`, `list(accountId, limit, cursor?)`, `history(accountId, conversationId, query)`, `send(accountId, conversationId, clientMessageId, text)`, `read(accountId, conversationId, sequence)`; every sequence is a decimal string. `send` returns `{ message, created }`; participant lookup returns peerId and both read positions.

- [x] Write and run failing repository tests: simultaneous open creates one pair/two members; concurrent duplicate sends store one row; reused ID/different content yields 409; nonparticipant gets 404; reads remain monotonic and reject nonexistent sequence.
- [x] Implement SQL migration and transactional repository (pair uniqueness, serialized sequence update, sender/client-ID advisory transaction lock); test persistence using isolated PostgreSQL with explicit opt-in URL.
- [x] Add validated environment, health, migration CLI and workspace scripts. `pnpm --filter chat-service build` passes; do not run application migrations on the user's database automatically.

### Task 2: Authenticated HTTP chat and gateway

**Files:** `chat-service/src/{app.module,bootstrap,main,health.controller}.ts`, `src/chat/{chat.dto,chat.policy,chat.service,chat.controller,chat.guard}.ts`, HTTP tests; gateway route/config and tests.

**Interfaces:** Approved HTTP paths/response objects in design §5 are authoritative. `ChatPolicy.profile(authorization, peerId)` returns safe peer or rejects; `ChatService` returns conversation with nullable peer, `canInteract`, both read cursors, lastMessage/unread count. `ChatEvents.publish(accountIds, event, payload, conversationId)` is injected via a token and does not cause a committed send to report failure if realtime delivery is unavailable.

- [x] Write failing HTTP tests: missing/forged identity, field validation, 200 send/retry, 409 conflict, history pagination, before+after rejection, block/unfriend, authority timeout and readiness behavior.
- [x] Implement guard → controller → service → repository, allow history without current friendship, check policy on mutations and new profile exposure. Enforce quota on sends and post-commit notifications.
- [x] Add `/chat/*` routing and `CHAT_SERVICE_URL` default to gateway, preserve authentication guards and all existing routes. Gateway regression tests and service build pass.

### Task 3: Real socket notifications and typing

**Files:** `chat-service/src/realtime/chat-socket.service.ts`, socket integration tests.

**Interfaces:** Socket.IO namespace `/chat`, path `/socket.io`; `auth.accessToken`. Implements Task 2 `ChatEvents`. Client input only `typing:update { conversationId,isTyping }`; events `message:new`, `conversation:updated`, `typing:updated`, `conversation:read`, `chat:error` as design §5.

- [x] Write failing two-client socket test using a real local HTTP/socket server: authenticate, send HTTP message, only valid participants receive; unauthenticated/third-party clients fail; revoked receiver receives no event; duplicate client ID is one persisted message; typing validation/rate/expiry.
- [x] Implement registry of authenticated sockets, five-socket quota, per-delivery authority+friendship checks, structured safe errors and shutdown cleanup. No arbitrary room joins and no raw token logs.
- [x] Run HTTP/socket tests against isolated fixtures and real repository integration. Verify resync after restart recovers committed messages independently of socket emits.

### Task 4: Flutter chat and screens

**Files:** `MobileApp/lib/features/chat/{domain,data,presentation}/**`, `pubspec.yaml`, `core/constants/api_constants.dart`, AuthApiClient area allowlist, HomeScreen entry; `MobileApp/test/chat_*_test.dart`.

**Interfaces:** REST contracts and events from Tasks 2/3. Reuse `UserApiClient` and its current/refresh session; injectable `ChatApi` and `ChatSocketClient` for tests. `CHAT_SOCKET_URL` is the origin, not namespace/path. Defaults: Android emulator host alias and iOS loopback, port 8083; explicit define overrides.

- [x] Write failing tests for models/controllers: ID merge, uncertain send then retry, missed-page resync/read recovery, stale responses after dispose/switch and socket refresh only once per auth failure.
- [x] Implement API/socket/state layers then inbox, friend picker, detail screens with existing LocCoc theme, empty/loading/error/offline states, draft retention, Unicode limits, typing and read receipts. Preserve scroll on older-page loading and avoid unsolicited jumps.
- [x] Connect authenticated Home entry and logout/session lifecycle; reject demo sessions. Extend AuthApiClient area allowlist with exactly `chat`.
- [x] Run `flutter analyze` and full `flutter test`; add widget tests for sending, retry and navigation. Validate native build if toolchain permits; report any unavailable verification.

### Task 5: Runbook, API contract and final verification

**Files:** `chat-service/{README.md,.env.example,openapi.yaml}`, `docs/guides/chat-two-emulators.md`, `PROJECT_CONTEXT.md`, approved spec/ADR status and this checklist.

- [x] Replace planned commands with actual scripts and exact per-device URL examples, database initialization for new/existing volumes, two real account setup, migration and verification steps.
- [x] Validate OpenAPI, internal documentation links and shell syntax. Clearly separate foreground realtime from OS background push.
- [x] Run service build/unit/HTTP/socket/PostgreSQL integration, gateway/auth regression tests and Flutter checks. Record skipped/unavailable tests honestly. Perform two-emulator smoke test only if devices and real local backend prerequisites are available; do not alter secrets or production data.
- [x] Request an independent code review of security, persistence and Flutter lifecycle, fix actionable findings, update context and final report with exact commands/test results and remaining limits. Commit only scoped changes; user has not requested pushing this chat branch.

## Delivery evidence — 2026-11-13

- Chat: build + 5 unit + 27 integration tests passed (7 actual PostgreSQL,
  6 HTTP and 14 real Socket.IO). PostgreSQL was disposable on 55483, without
  project volumes; HTTP authority/profile responses were controlled fixtures.
- Gateway: build, 3 unit + 26 e2e passed. Auth regression: 77 unit + 25 HTTP
  passed; 18 opt-in PostgreSQL cases skipped.
- Flutter: analyzer clean, all 131 tests passed; final Android debug APK built.
  Native iOS dependency resolution failed on the pre-existing Firebase/AppCheck
  versus GoogleSignIn graph; no unrelated version upgrades were introduced.
- Migration helper and CLI were verified twice using the dedicated chat role.
  Compiled service returned health200 and missing-auth401. OpenAPI official3.0
  schema, nullable conversation validation, local doc links and shell syntax pass.
- Independent review found five important integration defects: socket403 session
  handling, lost inbox invalidations, typing throttle/reconnect behavior, UUID
  case idempotency, and mobile history loading during profile503. Targeted RED
  regressions reproduced them; final suites pass after fixes. Awaiting resync
  also exposed and fixed a Future completion cycle. No Critical finding remained.
- Two-emulator UI smoke with real accounts remains a documented manual step,
  not a completed test claim. Runbook now defaults to two Android AVDs and
  explicitly requires the Tin nhắn flow open for realtime reception.
- Keep the requested local branch and preserve the pre-existing analysis config;
  do not push/create another PR as part of this implementation approval.
