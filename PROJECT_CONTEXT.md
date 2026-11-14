# LocCoc Project Context & Knowledge Base (Admin & Payment Module)

### 2026-11-14: Full-screen avatar and cover viewing for self and peer profiles

- Added `FullScreenImageViewer` (`core/widgets/full_screen_image_viewer.dart`) supporting pinch-to-zoom (`InteractiveViewer`), safe URL handling via `avatarUri`, dark theme backdrop, close/back controls, and descriptive empty states.
- Enhanced `UserAvatar` and `UserCover` with optional `onTap` callbacks and accessibility semantics.
- Connected own profile in `HomeScreen` (profile tab) allowing users to tap and inspect their own avatar and cover image in full resolution, while preserving the avatar edit action button.
- Connected peer profile in `UsernameProfileScreen` allowing users to tap and view other users' avatars and cover photos in full screen.
- Enhanced `EditProfileScreen` to allow quick preview of avatar and cover images while editing profile.
- Automated verification: Added 9 widget tests in `test/view_profile_images_test.dart` covering both own and peer profiles, standalone viewer mechanics, invalid URLs, and descriptive feedback when images are unset. All 274 Flutter tests pass.

### 2026-11-14: Local avatar save configuration fix

- Diagnosed preview/save failure: service-local MEDIA_ENABLED was false and
  the Compose media-store container had not been created.
- Enabled local uploads, started media-store, provisioned the configured bucket
  with anonymous object reads only, ran pending migrations and restarted the
  UserService development watcher. Existing secrets were preserved.
- Forwarded Android emulator port 9000 alongside Gateway port 8080 for the
  configured loopback media URL. Forwarding needs reapplying after reconnect.
- Verification: 9/9 isolated PostgreSQL/S3/Gateway media tests passed; local
  bucket upload/public byte-identical read passed and anonymous listing was
  denied (403). Temporary verification object removed; no user photo changed.
- No mobile code/APK change required. Saving the selected photo in the running
  app remains a manual device check. Details: docs/specs/user/profile-media.md.

### 2026-11-12: Avatar and cover upload

- Recorded ADR-014 and `docs/specs/user/profile-media.md` before implementation;
  preserved existing dirty work. `.agents` rules/skills are absent locally.
- Added nullable cover_url and an object lifecycle ledger with a transactional
  retirement trigger. Raw authenticated own-account avatar/cover PUT/DELETE goes
  through Controller -> Service -> Repository/Storage. New accounts are projected
  before upload; administrator routes cannot change another account's images.
- JPEG/PNG/WebP magic/MIME/decode checks, 5/10 MiB limits, 40 MP / 12000 axis,
  animation rejection, ten-second decode deadline, bounded concurrency, rotation,
  resize/WebP and metadata removal protect uploads. Redis enforces 10/min/account.
  Approved HTTPS URL compatibility cannot attach managed objects or unsafe schemes.
  Old media deletion is durable, retried and follows profile commit; failed
  storage/transactions preserve the old reference. Name cooldown is unchanged.
- Added optional Compose media-store with digest-pinned SeaweedFS 4.53, loopback S3
  only and explicit credentials. MinIO pulls failed at both official registries;
  S3-compatible SeaweedFS was verified with real storage. Explicit bucket setup
  grants anonymous object reads, without anonymous listing/writing. No real .env,
  secrets, live project data or deployments were changed.
- Both Gateways forward bounded raw image bodies under existing /users routing
  with upload quotas and 60s deadlines. Normal body limits remain. Flutter adds
  library/camera selection, preview, upload/clear, progress/errors and generation
  fences, plus shared safe cover rendering on own/peer profiles. Independent media
  commits preserve unsaved name edits. Vault v1 adds optional cover URL metadata.
- Actual verification: shared/User/Nest builds PASS; User 125 unit PASS and clean
  type-aware lint; isolated real PostgreSQL/S3 E2E 87 PASS / 16 existing optional
  infrastructure SKIP (all 9 media cases PASS); Nest Gateway 23 PASS; Spring
  Gateway 20 PASS; Flutter format 75 files/0 changed, analyze clean, 265 tests PASS.
  Android debug APK, Compose config and diff whitespace checks PASS. Artifact/hash
  and repeatable commands are in the media spec.
- Production S3/CDN/TLS configuration, live migration, device camera/gallery and
  permission UX, lost-activity recovery and iOS build remain unverified. Uploads
  stay disabled until real media configuration is supplied and schema applied.

### 2026-11-11: Flutter wave 3 — supported account actions and honest readiness

- Dependency-ordered plan and source evidence were written before implementation
  in `docs/specs/user/mobile-wave-3.md`. Existing dirty work was preserved. No
  backend, secrets/.env, live data, Kafka or discovery policy changes in this wave;
  no new architectural decision/ADR is required for the supported client behavior.
- EditProfile combines display name/avatar URL validation, preview and clearing.
  Avatar-only PATCH omits name; combined updates respect the existing server-atomic
  30-day name policy. Phone remains read-only: Auth owns accounts.phone and User
  projects it, so profile phone edits can be overwritten. No upload claim is added.
- Password form follows the actual DTO plus known server policy (10–128 characters,
  common-password/prefix/email exclusions, no invented composition rule). Wrong
  current password stays a form error after session probing; unavailable probes,
  403, throttling and network errors are not presumed revocation. Retry-After is
  shown safely. Public account has no hasPassword/provider capability, so a Google
  login cannot establish password absence; first-password setup remains unsupported.
- Extended the existing coordinator for exclusive password/logout-all operations
  alongside single-flight refresh. Strict replacement pairs preserve current
  identity and retention consent, advance generation, invalidate old reads and
  replace authenticated navigation once. Home stops old work and drains known
  pending push registration before new Home. Late server writes after HTTP timeout
  still need a backend ordering contract; native push integration is unverified.
- Lost/malformed password responses never fabricate success or automatically retry
  the password mutation/old RT. Explicit reauthentication is offered. Acknowledged
  changes with persistence failure continue using the new in-memory session and
  warn honestly; other saved accounts are preserved. Storage failure cannot promise
  durable erasure. Logout-all requires confirmation/server acknowledgement, blocks
  repeat actions and reuses revocation teardown without retaining revoked sessions.
- Signup/OTP remains closed: AuthModule binds ConsoleOtpSender unconditionally and
  it performs no delivery in production. Real sender/verified delivery, generic
  enumeration-safe outcomes and structured throttling are prerequisites. Future
  UI must read verified:true, create no session from tokenless verification, then
  return to login. No OTP success or production readiness is claimed.
- Actual verification: baseline 202 tests rerun; final default 245 PASS, opt-in
  Debug 248 PASS, no failures/skips. Added 43 account-security/UI tests covering
  races, stale results, storage/push ordering, forms, confirmation and 360px/200%
  text with keyboard. Format check 71 files/0 changed, analyzer no issues; scoped
  diff whitespace check PASS. Android release built with dev flag true; AOT marker
  inspection passes across three ABIs. Artifact/hash are recorded in the wave-3
  spec. Existing local signing is not store signing. Android/iOS device UX, live
  Auth/push/secure-storage integration, OTP delivery and iOS build remain unverified.

### 2026-11-11: Flutter wave 2 — shared avatar, accessible theme and gated Debug

- Plan and detailed evidence: `docs/specs/user/mobile-wave-2.md`, recorded before
  implementation. Preserved the existing dirty worktree; no backend, secrets/.env,
  live data, Kafka or Smart Discovery policy changes. Wave 3 remains separate.
- Shared UserAvatar now handles all person-image API URLs with host/scheme checks,
  HTTPS in release, bounded decoding, no application auth headers and initials/icon
  fallback. SavedAccount/vault adds optional sanitized avatarUrl while reading old
  v1 rows. The edit badge opens an explicitly URL-only preview/editor through the
  existing avatarUrl PATCH contract; name cooldown/phone/upload are unchanged.
- Theme covers common surfaces/forms/buttons/chips/dialogs/SnackBars. Original
  coral stays as brand; dark coral with white reaches 5.74:1, secondary text on
  main background 5.74:1 and input hint text 4.80:1. Narrow/large-text layouts grow
  or wrap, including keyboard checks. Navigation/header/Debug were extracted from
  Home; internal HomeTab mapping preserves existing initialTab:2 behavior.
- Social labels are Vietnamese, search clears quickly, card bodies open profiles,
  embedded blocked chips are hidden while Settings initialTab:4 remains. Friends,
  mutuals and inbox dedupe within/across pages; single-card actions and unchanged
  returns retain pages/cursors/scroll. Server-hidden/unavailable mutual responses
  remove previous identities. Inbox shows local times and trimmed actor fallback
  from payload without profile-enrichment queries.
- Debug requires kDebugMode AND LOCCOC_DEV_TOOLS=true, independent of roles. Home
  and profile no longer show technical account/token data. Debug masks AT, never
  renders RT, bounds/redacts observational JWT claims and shares the coordinator
  for Force Refresh. Busy/stale-session guards protect reloads. Firebase setup,
  permission and server registration diagnostics are distinct; push disposal is
  idempotent and strict retained-logout detach remains intact.
- Actual checks: format 66 files/0 changed, analyzer no issues, default full suite
  202 PASS and opt-in development full suite 205 PASS (no skipped cases). Baseline
  was actually rerun: 171 PASS. Widget tests cover 360px/200% text/long names and
  keyboard. Final Android release with dev flag intentionally true built; AOT APK
  inspection found no Debug markers across three ABIs. Artifact/hash and repeatable
  verification command are recorded in the wave-2 spec.
- Native Android/iOS UI, live push/images/secure storage and iOS signing remain
  unverified. APK uses existing local signing, not store signing. Java native-access
  and firebase_core Kotlin migration advisories remain; no upgrade was attempted.

### 2026-11-11: Flutter wave 1 — correctness and shared session lifecycle

- Recorded the dependency-ordered plan before implementation in
  `docs/specs/user/mobile-wave-1.md`. Preserved preexisting uncommitted discovery,
  profile and backend work. The referenced `.agents` directory is absent locally.
- Own-profile Share now opens a real QR/link/copy/native-share sheet using the
  existing username/domain. Failed clipboard writes do not report success; Demo
  and invalid/missing usernames cannot fabricate public links.
- Real profiles use API avatars and friendCount, omit sample 128/24 statistics
  and biography, and label moments/feed/gallery as previews. Profile friends opens
  the retained tab, preserving loaded pages/cursors/subtab/scroll; returning from
  inbox or push-open refreshes both notification and friendship counts.
- Email login now matches LoginDto, classifies errors without message matching,
  safely displays Retry-After and removes Demo failure actions. Standalone Demo
  remains explicit without asserting real authentication/email verification.
- Extended the existing GoogleAuthService coordinator: single-flight rotation,
  generation-guarded requests/vault writes, no replay/retention of ambiguous RTs,
  coalesced revocation and one shared AuthScreen transition. Old read/refresh/logout
  results cannot overwrite a newer login, including the same account. Identity and
  other accounts' credentials are preserved. Push detach cannot trigger refresh.
- Backend change-password's ambiguous 401 is checked through GET /auth/sessions
  before rotation; wrong current password remains a form error. Ordinary 403,
  transport/timeouts/5xx and a second generic access 401 are nonterminal.
- Actual final verification: dart format check (53 files, 0 changed), flutter
  analyze (no issues), flutter test (171 passed, no failures/skips), scoped diff
  whitespace check PASS. Tests include 360px/200% text with keyboard. Formatting
  normalized a few existing Flutter files without changing their behavior.
- No backend, .env/secrets, live data, Kafka/Smart Discovery decisions or deployment
  changes in this wave. Native Android/iOS sharing, push, secure storage and device
  UX remain unverified; no APK/release/iOS build or release-debug exclusion claim.
  Wave 2/3 remain deferred; no new architectural/product approval is needed for
  the implemented wave 1 fallback. See the linked spec for evidence and limits.

### 2026-11-10: Smart friend discovery design preparation

- Recorded the supplied PostgreSQL + outbox/Kafka + Neo4j + Redis clarification
  verbatim in `docs/specs/user/smart-discovery-input-2026-11-10.txt`.
- Added ADR-012 and `docs/specs/user/smart-friend-discovery.md`: baseline decisions,
  repository gaps, privacy/cache consistency boundaries, proposed APIs, rollout
  sequence, verification checklist and Q1–Q10 awaiting product confirmation.
- Discovery accepts account-status projection lag and third-party ranking staleness
  until cache refresh; synchronous PostgreSQL block checks remain mandatory.
  Existing caller/target authority checks under ADR-006 remain unchanged.
- Documentation only: no runtime code/configuration, schema/data, services or
  secrets changed. This feature is not implemented; no runtime tests were run.

### 2026-11-04: Merge custom/identity into main

- Merge source: local custom/identity at 425d157, including its rate-limit update.
  Auth/User/Notification behavior, migrations and tests follow custom/identity.
  Compatible explicit Auth/User migration commands and the Spring gateway
  alternative from main are retained.
- Resolved package.json by retaining both migration commands and the notification
  startup command. Combined both branches' context documentation. The root build
  now selects services explicitly because the previous directory glob selected
  none with the installed Windows/pnpm setup.
- Verification: shared library and all four Nest services build; User/Notification
  lint passes. Auth: 77 unit + 43 HTTP/PostgreSQL tests; User: 37 unit + 48
  HTTP/PostgreSQL/Kafka tests; Notification: 27 tests including PostgreSQL/Kafka;
  Nest gateway: 16 tests; Spring gateway: 19 tests; Flutter: 99 tests. All passed.
- PostgreSQL integration checks used a disposable container on port 55439, and
  Kafka checks used generated test topics with cleanup. Production data and
  local secrets were not modified. The Spring alternative retains its existing
  five prefixes; notification routing is available through the Nest gateway.

### 2026-11-03: Social outbox batching and independent cleanup

- SocialOutboxPublisher now sends up to 20 selected events in one Kafka send,
  then marks their IDs published with one SQL update. Empty batches do not send.
- Publishing still holds the existing PostgreSQL transaction/row locks across
  Kafka I/O; at-least-once delivery, stable event IDs and consumer deduplication
  are unchanged. Send/DB failures leave the transaction retryable.
- Cleanup has its own five-minute timer and removes up to 500 published rows
  older than seven days per run. Cleanup failures are isolated from publishing;
  overlapping cleanup is guarded and scheduled work is awaited on shutdown.
- Verification: UserService build/lint passed; 35 unit tests and 5 integration
  tests passed. PostgreSQL 17 was disposable; Kafka was mocked. No project
  database, secrets or deployment configuration was changed.
- Details: docs/specs/user/social-outbox-publisher.md and ADR-007.

> Notification implementation (2026-10-30): added notification-service (8084),
> signed cursor inbox, monotonic per-user lastSeen, per-item readAt, counts,
> social transactional outbox/Kafka, durable FCM push jobs and Flutter inbox/push.
> See [ADR-007](docs/adr/ADR-007-notifications.md),
> [setup/learning](docs/specs/notification/setup-and-learning.md) and quest.txt §6.8.
> Verified with disposable PostgreSQL/isolated Kafka topics and mocked FCM; real
> Firebase/APNs credentials/native signing and project database migrations remain
> deployment steps. No real .env or project databases were changed. Account-deletion
> anonymization policy remains open. Inbox TTL 90 days; push delivery window 24h.
> `npm run dev` in notification-service builds once and starts the server without watch mode.

> **Tài liệu lưu trữ toàn bộ ngữ cảnh phát triển (Context Snapshot)** dùng để nạp vào các phiên làm việc (Conversation) mới của AI Assistant hoặc bàn giao giữa các developer.

---

## 1. Tổng Quan Kiến Trúc Dự Án (Monorepo Layout)

* **Repository:** `LocCoc IAM & Subscription Platform`
* **Cấu trúc Monorepo:**
  * `api-gateway` (NestJS 12, Port: `8080`): Edge proxy, Helmet, CORS, Rate Limit, Forwarding `x-request-id`.
  * `auth-service` (NestJS 12, Port: `8000`): Quản lý danh tính, JWT (RSA/EC keys).
  * `user-service` (NestJS 12, Port: `8081`): Quản lý profile người dùng.
  * `admin-service` (Spring Boot 3 / Java 17, Port: `8086`): Quản trị Tiers, Override gói cước, Audit Logging, Dashboard Reports & Analytics, System Moderation & Reports.
  * `payment-service` (Spring Boot 3 / PayOS SDK 2.x, Port: `8085`): Tạo link VietQR PayOS, tiếp nhận Webhook HMAC SHA256, kích hoạt gói Subscription, Auto-expiration.
  * `libs/common`: Thư viện dùng chung của NestJS (Guards, Decorators, Filters).
  * `MobileApp`: Ứng dụng di động Flutter (iOS & Android).

---

## 2. Hạ Tầng & Cơ Sở Dữ Liệu (Docker Compose)

Khởi động qua: `docker compose up -d`
* **MySQL 8.0 (Port `3307`):** Dành riêng cho `admin-service` và `payment-service`.
  * `admin_db` (`admin_user` / `admin_password`): Bảng `audit_logs`, `tiers`, `user_subscriptions`, `system_reports`.
  * `payment_db` (`payment_user` / `payment_password`): Bảng `tiers`, `payment_transactions`, `user_subscriptions`.
  * Khởi tạo tự động qua script: [docker/mysql/init-databases.sql](file:///c:/HDV/LocCoc/docker/mysql/init-databases.sql)
* **PostgreSQL 17 (Port `5433`):** Dành cho `auth-service` và `user-service`.
* **Redis 7 (Port `6379`):** Caching Tier (`user:{userId}:tier`) và Rate Limiting.
* **Kafka 4.3.1 (Port `9092`) + Kafbat UI (Port `9080`):** Xử lý sự kiện bất đồng bộ:
  * Topic `subscription.events`: Phát khi user được kích hoạt / gia hạn / override gói.
  * Topic `payment.events`: Phát khi đơn thanh toán hoàn tất.
  * Topic `admin.moderation.events`: Phát khi Admin duyệt xử lý báo cáo vi phạm (BAN_USER, DELETE_POST, etc.).

---

## 3. Tích Hợp Cổng Thanh Toán PayOS (SDK 2.x)

* **SDK Version:** `vn.payos:payos-java:2.0.1`
* **Thông tin kênh:** Kênh `LocCoc` - Ngân hàng `MBBank` (`0867674359` - `NGUYEN DUC THINH`).
* **Cấu hình môi trường (`.env`):**
  ```env
  PAYOS_CLIENT_ID=b5673b46-cebc-4f4e-8d13-7d4f4ce9bc7a
  PAYOS_API_KEY=<api-key-tu-dashboard>
  PAYOS_CHECKSUM_KEY=<checksum-key-tu-dashboard>
  PAYOS_RETURN_URL=http://localhost:8080/payments/success
  PAYOS_CANCEL_URL=http://localhost:8080/payments/cancel
  ```
* **Công cụ Tunnel Public Webhook:**
  * Dùng **Cloudflare Tunnel**: `cloudflared tunnel --url http://localhost:8085` (tránh trang cảnh báo của ngrok free).
  * Webhook URL đăng ký: `https://<tunnel-url>/payments/webhook/payos`
* **Scripts Đăng Ký Webhook Đã Tạo:**
  * PowerShell: `.\scripts\register-webhook.ps1 -WebhookUrl "<URL>"`
  * Node / npm: `npm run webhook:register <URL>`

---

## 4. Các API Đã Triển Khai & Kiểm Thử Thành Công (Postman Ready)

| Service | Method | Endpoint | Mô tả & Header |
| :--- | :--- | :--- | :--- |
| **Payment** | `POST` | `/payments/create-checkout` | Tạo link VietQR PayOS (`Header: x-user-id: 1`, `Body: {"tierId": 2}`) |
| **Payment** | `POST` | `/payments/webhook/payos` | Nhận Webhook từ PayOS (Verify HMAC SHA256 & Idempotency) |
| **Payment** | `POST` | `/payments/webhook/confirm` | API đăng ký Webhook URL với PayOS |
| **Payment** | `GET` | `/subscriptions/me` | Lấy gói đang hoạt động của User (Kèm auto-expiration check) |
| **Payment** | `GET` | `/subscriptions/history` | Lịch sử mua gói của User |
| **Payment** | `GET` | `/health` hoặc `/` | Health check endpoint |
| **Admin** | `GET` | `/admin/tiers` | Lấy danh sách các gói cước (`FREE`, `PRO`, `VIP`) |
| **Admin** | `POST` | `/admin/tiers` | Tạo gói cước mới (`ENTERPRISE`) |
| **Admin** | `PUT` | `/admin/tiers/{id}` | Cập nhật thông tin / giá / hạn mức gói |
| **Admin** | `POST` | `/admin/users/{userId}/override-tier` | Nâng/Gán Tier thủ công (`Body: {"tierId": 3, "durationDays": 30, "reason": "..."}`) |
| **Admin** | `GET` | `/admin/audit-logs` | Xem nhật ký kiểm toán thao tác của Admin |
| **Admin** | `GET` | `/admin/reports/overview` | Báo cáo Dashboard tổng quan (Tổng user, doanh thu, gói) |
| **Admin** | `GET` | `/admin/reports/tiers-distribution` | Thống kê tỷ lệ phân bổ người dùng theo gói |
| **Admin** | `GET` | `/admin/reports` | Xem danh sách các báo cáo vi phạm (POST, USER, CHAT) |
| **Admin** | `POST` | `/admin/reports` | Tạo báo cáo vi phạm mới |
| **Admin** | `PUT` | `/admin/reports/{id}/resolve` | Admin duyệt xử lý vi phạm & phát Kafka event |

---

## 5. Các Vấn Đề Kỹ Thuật Đã Xử Lý (Key Gotchas & Solutions)

1. **Spring Boot .env Loading:**
   * *Vấn đề:* Khi chạy `mvn spring-boot:run` từ thư mục con, Spring Boot không tự động đọc file `.env` ở thư mục gốc.
   * *Giải pháp:* Đã bổ sung hàm `loadDotEnv()` thuần Java trong [PaymentServiceApplication.java](file:///c:/HDV/LocCoc/payment-service/src/main/java/com/loccoc/payment/PaymentServiceApplication.java) và [AdminServiceApplication.java](file:///c:/HDV/LocCoc/admin-service/src/main/java/com/loccoc/admin/AdminServiceApplication.java) để nạp biến môi trường vào `System.setProperty()` trước khi Spring khởi động.
2. **PayOS Test Ping Webhook 400 Error:**
   * *Vấn đề:* Khi bấm xác nhận Webhook trên PayOS, PayOS gửi 1 request test (chưa có đơn hàng trong DB), code cũ ném ngoại lệ 400 khiến PayOS báo `Webhook url invalid`.
   * *Giải pháp:* Trong [SubscriptionService.java](file:///c:/HDV/LocCoc/payment-service/src/main/java/com/loccoc/payment/service/SubscriptionService.java), nếu `orderCode` không có trong DB thì ghi log và return thành công, đồng thời `PayOSWebhookController` luôn phản hồi `HTTP 200 OK`.
3. **Ngrok Interstitial Warning Bypass:**
   * *Vấn đề:* Ngrok Free trả về trang HTML cảnh báo người dùng làm chặn request JSON của PayOS.
   * *Giải pháp:* Chuyển sang sử dụng **Cloudflare Tunnel (`cloudflared`)** hoàn toàn miễn phí và không bị chặn.
4. **Mã Hóa Tiếng Việt UTF-8 (Unicode):**
   * *Vấn đề:* Tên gói tiếng Việt có dấu bị lỗi font khi query qua API.
   * *Giải pháp:* Bổ sung `useUnicode=true&characterEncoding=UTF-8` vào chuỗi kết nối MySQL JDBC trong `application.yml` và đảm bảo database dùng `utf8mb4`.
5. **DTO Field Validation (`durationDays`):**
   * *Vấn đề:* Request can thiệp gói `/admin/users/{userId}/override-tier` yêu cầu trường `durationDays` (số ngày muốn gia hạn/cấp gói).
   * *Giải pháp:* Body chuẩn: `{"tierId": 3, "durationDays": 30, "reason": "..."}`.

---

## 6. Lệnh Vận Hành Nhanh (Cheat Sheet)

```powershell
# 1. Bật toàn bộ database & message broker
docker compose up -d

# 2. Bật tunnel ra internet cho Webhook
cloudflared tunnel --url http://localhost:8085

# 3. Chạy Payment Service (Port 8085)
npm run start:payment

# 4. Chạy Admin Service (Port 8086)
npm run start:admin

# 5. Đăng ký Webhook PayOS
npm run webhook:register https://<your-tunnel-url>/payments/webhook/payos
```

## Spring MVC Gateway Alternative

`api-gateway-spring` implements the same five route prefixes as the Nest gateway on port 8080, using Controller -> Service -> Repository, Redis atomic IP quotas, CORS, request IDs and standard gateway errors. No business database, automatic retries or redirects. Configuration and startup: `api-gateway-spring/README.md`. Stop Nest gateway before starting the Spring alternative. Spec: `docs/specs/gateway/spring-mvc-gateway.md`; decision: ADR-005. Verification uses a loopback HTTP upstream and mocked quota repository; real-service/Redis deployment smoke tests remain environment-dependent.


## PostgreSQL first-run migrations

Docker creates databases/roles only. The shared environment validator defaults TYPEORM_MIGRATIONS_RUN=false, which overrides the database factory fallback. Use npm run db:migrate:auth and npm run db:migrate:user to apply pending migrations explicitly; synchronize remains false. Postman OTP verification requires Register first and a fresh development OTP. Both gateway implementations route the same service prefixes, with documented differences in quotas, proxy trust, security headers and health probes.

Bootstrap verification (2026-10-19): applied all three auth migrations and the users migration to local Compose PostgreSQL, confirmed the tables and re-ran both migration runners successfully. Live Spring gateway /health returned 200; /auth/verify-otp with a nonexistent diagnostic email and invalid OTP returned 200 with verified=false. Auth unit tests: 28 passed. User migration configuration: 2 passed; existing AppModule test fails resolving JwtAuthGuard Reflector. No secrets or PostgreSQL volumes were changed.


## Spring gateway error envelope (WebAppBusTicket pattern)

api-gateway-spring uses ErrorCode + AppException + GlobalExceptionHandler and ApiResponse(code,message,result). Both gateway failures and upstream HTTP 4xx/5xx errors are normalized; messages are catalog-based to avoid exposing SQL/secrets. HTTP status, auth/retry headers and x-request-id remain available. Successful upstream bodies are unchanged, including verified=false on HTTP 200. Direct service responses and Nest gateway are unchanged. This supersedes the earlier transparent-error contract for Spring gateway.
## 7. IAM Social Login (2026-10-23)

- `auth-service` implements `POST /auth/social/google` and `POST /auth/social/apple`, public through the existing gateway `/auth/*` route; rate limit: 5 requests/IP/minute/provider.
- Provider ID tokens are verified with `jose` and fixed Google/Apple JWKS: RS256 signature, issuer, configured audience/authorized party, expiry, issuance time and nonce if present. Redis consumes the signed-token digest atomically to reject replay.
- `identities` belongs to the accounts PostgreSQL database, keyed by `(provider, provider_user_id)` and linked to `accounts.id`. Auto-link requires a signed verified email and an active local account. Pending accounts require additional verification to prevent account pre-hijacking; suspended/deleted accounts cannot sign in.
- Apple private relay emails are retained. Optional Apple `name` is untrusted display metadata, saved on first identity creation only; it is never used for authentication or linking. Subsequent sign-ins can omit email/name for an existing identity.
- Social-only accounts have a nullable password hash. Social sessions reuse `AuthService.createSession` and `TokenService`; normal refresh-token rotation, replay detection and logout apply.
- Deployment: set `GOOGLE_CLIENT_IDS` and `APPLE_CLIENT_IDS`, then run migration `CreateIdentities1710000001200` via the auth deployment's `TYPEORM_MIGRATIONS_RUN=true`. Local `.env` and real databases were not changed for this implementation.
- Tests use locally signed mock ID tokens and provider JWKS fixtures, covering wrong audience/issuer, expiry, signature, nonce, account linking, relay/name persistence, rate limits, gateway routing and session compatibility. See [spec](docs/specs/auth/social-login.md) and [ADR](docs/adr/ADR-005-social-login.md).

## 8. Mobile Google login fixes (2026-10-26)

- Google SDK initialization now propagates failures and only marks initialization complete after success, allowing a later retry.
- Mobile logout calls the existing gateway `POST /auth/logout` with the LocCoc access token before clearing the in-memory session and signing out Google. An expired AT is refreshed through `POST /auth/refresh`; rotated credentials are retained for a failed logout retry. If both AT and RT are rejected, local logout can complete.
- While logout is pending, duplicate submissions are disabled. Network/server errors retain the current screen with a retry message; completed logout removes authenticated routes. No persistent mobile token store currently exists.
- Verification: all 18 Flutter tests passed, including initialization retry, authenticated logout ordering, expired AT/refresh rotation, rejected credentials, network failure and logout UI retry. Provider and HTTP responses are mocked; live Google login was not exercised.

## 9. Android startup/build fix (2026-10-26)

- Reproduced `:google_sign_in_android:compileDebugKotlin` failure: Kotlin incremental cache conversion failed because plugin sources are in the Pub cache on C: while the Android project is on D: (`this and base files have different roots`).
- Set `kotlin.incremental=false` in `MobileApp/android/gradle.properties`; documented the compile-time tradeoff in the mobile README. No authentication code changes were needed.
- Verified debug APK build and `flutter run --debug --no-pub --no-resident` on the connected M2103K19G (Android 13). The app process remained running and its checked error log contained no Flutter/AndroidRuntime crash. Flutter analysis reported no issues and all 18 tests passed. Google account sign-in was not exercised.

## 10. Android Google server client ID fix (2026-10-26)

- The mobile adapter previously passed null for `serverClientId` and Android had no Google Services configuration, causing `serverClientId must be provided on Android` before account selection. The adapter now reads the public `GOOGLE_SERVER_CLIENT_ID` Dart build define, while preserving explicit overrides and native configuration fallback.
- `scripts/run-mobile.ps1` forwards only public mobile configuration from root `.env`. It uses an explicit Web client ID, or the existing single `GOOGLE_CLIENT_IDS` entry; multiple backend IDs require selecting the web client explicitly. The local `.env` and backend token verification were not changed.
- SDK configuration failures now display a readable Vietnamese message. Tests verify forwarding the build define, explicit override and configuration failure without backend calls.
- Verification: Flutter analysis passed; all 21 Flutter tests passed with a test Web client ID; launcher checks passed for existing configuration, public-only arguments, explicit overrides and invalid ID rejection. Built, installed and launched the debug APK on `emulator-5554` using the current local Google ID. Live account sign-in and Google Cloud package/SHA-1 registration still require verification.

## 11. Keep Google configuration in ordinary Android builds (2026-10-26)

- Follow-up failure: the app was installed again at 20:16 after the launcher build at 20:15. The newer compiled Flutter kernel did not contain the configured Google client ID; the launcher-only fix was lost during an ordinary rebuild. In the installed Android plugin, `clientConfigurationError` specifically maps to a missing server client ID.
- Android Gradle now resolves the public Web client ID from the process environment or root `.env` and generates `default_web_client_id`, which the Google SDK uses when no Dart override is supplied. Enabled AGP 9's `resValues` build feature. No backend secrets are included as assets and the local `.env` is unchanged.
- Verified an Android debug build without Google Dart defines, checked that the generated resource and packaged APK contain the exact locally configured public ID, and passed all 21 Flutter tests without Google build defines. Installed and launched using ordinary `flutter run` on `emulator-5554`; Android resource lookup confirmed the installed app resolves the expected Google ID. Live Google account authentication remains a separate check.

## 12. Local Web OAuth client configuration (2026-10-26)

- Google Play services logged `You must use a Web client as the server client ID` after account selection. The previous single allowed ID was an Android client ID, so it was incorrectly reused as `serverClientId` by the native fallback.
- The user supplied a Web application OAuth client ID from the same Google Cloud project. The ignored root `.env` now sets it explicitly as `GOOGLE_SERVER_CLIENT_ID` and includes both the new Web ID and the existing Android ID in `GOOGLE_CLIENT_IDS`. No client secret or tracked credential was added.
- Rebuilt and reinstalled the app on `emulator-5554`; Android resource lookup confirms the installed app uses the supplied Web ID. Restarted the local auth-service so its audience allowlist reloads. Gateway health returns 200 and a deliberately invalid social token receives 401 through the gateway, confirming the social route and configured provider are reachable. A real Google account sign-in still needs to be tried by the user; Android OAuth registration for package `com.example.mobile_app` and the debug signing SHA-1 remains a Google Cloud check.

## 13. Google login replay after UI rebuild (2026-10-26)

- Confirmed the reported account remains active, is not deleted, and retains its Google identity. Safe auth diagnostics from the user's retry confirmed `token_replay`: Google returned a previously consumed ID token after the mobile rebuild. The old client mapped every 401 to a message suggesting the account was locked.
- Android now uses an independent Google platform adapter per interactive attempt with a cryptographically random 32-byte nonce. The same locally generated nonce is sent to the existing gateway exchange and checked by the backend. This avoids repeatedly initializing the high-level Google singleton and keeps backend replay protection intact. No account state, secrets, or replay markers were changed.
- Replay returns HTTP 401 with `SOCIAL_TOKEN_REPLAY`, logs only provider/event/reason, and displays a specific retry message. Other 401 responses use a neutral verification failure message.
- Verification: Flutter analysis passed; all 24 Flutter tests passed, including repeat login with distinct nonce-bound tokens, cancellation/retry, nonce forwarding, logout and error messages. All 48 focused backend unit tests and 15 social HTTP tests passed, including repeat login for the same subject with fresh nonces and rejection of reused tokens. Auth build and Android debug APK build passed.
- Installed and opened the corrected APK on `emulator-5554`. The user confirmed successful live Google sign-in with the reported account after installation.

## 14. Mobile Home Page Display & Form Login Integration (2026-10-27)

- **Vấn đề đã xử lý:** Trước đó sau khi đăng nhập (Google Sign-In hoặc Email/Password), màn hình hiển thị chỉ là màn debug thông tin token kỹ thuật thô (`Thông tin tài khoản`, `Access Token`) mà không hiển thị **Trang chủ (Home Page)** của LocCoc. Đồng thời form email/mật khẩu bị chặn với thông báo "Đăng nhập chưa khả dụng".
- **Hiện thực hóa Trang chủ chuẩn thiết kế (Home & Profile):**
  - Đã tích hợp đầy đủ bộ tài nguyên hình ảnh (`assets/images/`) theo bản vẽ thiết kế (`Home.html`, `Profile.html`, `Home.png`, `Profile.png`).
  - Triển khai toàn diện giao diện `HomeScreen`:
    - **Tab 0 - Trang chủ:** Header thương hiệu `LocCoc ✦`, lời chào `Chào, [Tên]` & avatar; Tiêu đề *"Một chút hôm nay. Những điều nhỏ xíu, gửi người thân yêu."*; Hàng Story bạn bè (*Mời bạn*, *Nam*, *Thảo Vy*, *Linh*, *Bân*); Bài đăng nổi bật (*Ảnh cà phê, Author pill, Huy hiệu Bạn thân, Nút tim tương tác*); Nút hành động nổi bật gradient *"Gửi một khoảnh khắc"*; Thanh điều hướng dưới 3 tab (*Trang chủ*, *Kỷ niệm*, *Cá nhân*).
    - **Tab 1 - Kỷ niệm:** Bộ sưu tập kỷ niệm với hình ảnh, nhãn thời gian và mô tả.
    - **Tab 2 - Cá nhân:** Hồ sơ người dùng hoàn chỉnh với chỉ số tương tác (128 Khoảnh khắc, 8 Bạn thân, 24 Ngày bên nhau), nút Chỉnh sửa hồ sơ, Góc kỷ niệm, Vòng tròn bạn thân, Cài đặt & Quyền riêng tư, Thông tin phiên đăng nhập & Nút Đăng xuất.
  - Kết nối `AuthApiClient.loginWithPassword` với endpoint `POST /auth/login`, đồng thời hỗ trợ chế độ Trải nghiệm nhanh (Demo) khi máy chủ backend đang ngoại tuyến.
- **Kiểm thử & Xác thực:** Toàn bộ 26 bài test Flutter (`google_auth_test.dart` và `widget_test.dart`) đều pass 100%; `flutter analyze` đạt 0 lỗi, bundle build thành công.

## 15. Service-local environment configuration (2026-10-27)

- `api-gateway`, `auth-service`, and `user-service` now load `.env` only from their own service directory, regardless of the shell's working directory. The root `.env` remains available for Docker Compose and other existing tooling, but is no longer a fallback for these three services.
- Shared Joi field definitions remain in `libs/common`, with separate gateway, auth, and user validators. Auth validates its own database and signing key; user validates its own database and verification key; gateway validates its routing, Redis, CORS, and rate-limit settings. Relative JWT key paths resolve from the service directory.
- Each service has a tracked `.env.example` and an ignored local `.env` populated from the existing root configuration. The existing root `.env` was left unchanged. Built all three services and `libs/common`; all three local configurations passed validation.

## 16. Physical Android Google login connection fix (2026-10-27)

- Found that every Android build defaulted to the emulator-only gateway host
  `10.0.2.2:8080`. Google and password login HTTP requests had no deadline, so
  an unreachable gateway could leave the login spinner running indefinitely.
  The connected M2103K19G had no API reverse forwarding; the host gateway was
  healthy on port 8080.
- Native mobile development now defaults to `127.0.0.1:8080`. Android debug
  builds run `configureDebugApiReverse` before `preDebugBuild`, forwarding port
  8080 for connected authorized devices and emulators even with cached builds.
  Explicit API URL overrides and the Web localhost default are preserved.
  INTERNET is declared in the main manifest, with local cleartext HTTP enabled
  only in debug. Deployment still requires an explicit HTTPS endpoint.
- Login exchanges have a 15-second deadline covering the response body. Timeout
  returns a readable Vietnamese error and releases the loading state. Late
  responses cannot complete a timed-out login; retry requests fresh Google
  credentials. Duplicate Google/password submissions are blocked. Backend
  verification, nonce/replay protection and local secrets are unchanged.
- Verification: 31 Flutter tests passed, including stalled network/header/body,
  timeout/retry, late success and duplicate Google taps. Flutter analysis passed;
  the debug APK built and ordinary `flutter run --debug --no-pub --no-resident`
  installed/launched it on M2103K19G. A direct request from the phone over the
  forwarded port received gateway HTTP 200 with `{"status":"ok"}`. App startup
  logs contained no Flutter/AndroidRuntime errors. Live Google account selection
  and successful provider login still need user confirmation.

## 17. Mobile Wi-Fi access after unplugging USB (2026-10-28)

- User confirmed Google login works with USB/loopback. Direct requests from the
  phone (`10.251.36.96`) to the laptop (`10.251.37.35:8080`) timed out even though
  the gateway listened on all interfaces and responded locally. Windows Wi-Fi
  was Public; an enabled local TCP firewall rule explicitly blocked
  `D:\MySystemApplication\node.exe` on that profile.
- After explicit user approval for a persistent, narrowly scoped exception,
  kept the existing Node Public TCP block on ports 1-8079 and 8081-65535. Added
  `LocCoc-Dev-Gateway-Phone-WiFi` to allow TCP/8080 only from that phone IP to the
  laptop IP on Wi-Fi, plus `LocCoc-Dev-Gateway-Block-Other-Devices` to retain
  explicit blocking on that port for other IPv4 peers and ordinary IPv6 unicast
  scopes. Domain, Private and Public firewall profiles all remain enabled.
- Removed ADB reverse forwarding and verified a direct request from the phone
  to the laptop LAN IP received HTTP 200 with `{"status":"ok"}`. This verifies
  the API connection uses Wi-Fi and does not depend on USB port forwarding.
  DHCP IP changes require updating the scoped exception and/or mobile API URL.
  No backend verification, authentication logic, or secrets were changed.
- Rebuilt, installed and launched the Android debug app on M2103K19G with
  `API_BASE_URL=http://10.251.37.35:8080`. Removed port 8080 ADB reverse again
  after the debug build so the installed LAN configuration does not depend on it.

## 18. Allow local Wi-Fi clients without fixed phone IPs (2026-10-28)

- At the user's explicit request, replaced the phone-IP allow rule and its
  companion other-device block rule with `LocCoc-Dev-Gateway-LAN-WiFi`.
  This allows inbound TCP/8080 for `D:\MySystemApplication\node.exe` from
  `LocalSubnet`, on Wi-Fi only, with Public/Private profiles and local address
  Any. No phone IP or laptop IP is fixed in the new firewall rule.
- Kept the existing Node Public TCP block on other ports and confirmed the
  effective default inbound policy is Block. All firewall profiles remain
  enabled. The previous phone-specific rules were removed after the Wi-Fi
  health check passed; their prior state is backed up locally for rollback.
- Verified a direct request from the connected Android phone to
  `10.251.37.35:8080/health` returned HTTP 200 with `{"status":"ok"}`.
  The installed app already uses this laptop LAN URL, so no rebuild is needed.
  Changing the phone's DHCP IP no longer requires a firewall update. A change
  to the laptop IP still requires updating the app's API URL.

## 19. Gateway routing after service-local environment split (2026-10-28)

- Gateway now validates `ADMIN_SERVICE_URL` and `PAYMENT_SERVICE_URL` with local
  defaults `http://127.0.0.1:8086` and `http://127.0.0.1:8085`. Existing gateway
  `.env` files without these keys can route to the standard local service ports.
  Explicit HTTP(S) URLs override the defaults; invalid values fail validation.
- Added the two URLs to `api-gateway/.env.example` and documented the existing
  `/admin/*`, `/payments/*` and `/subscriptions/*` routes. Custom URLs previously
  configured only in root `.env` must be supplied to Gateway's own environment.
- Admin/Payment source, environment loading, database and PayOS configuration
  are unchanged. Their existing loaders still use the root `.env`; keep those
  settings there. No actual `.env` files or secrets were modified for this fix.
- Verification: common library and Gateway builds passed. Twelve focused
  gateway tests passed, covering business routing with defaults/overrides,
  invalid URLs, unavailable Payment returning 502, and existing social routing.
  Upstreams were mocked; live Java services were not started for these tests.

## 20. User profiles, friendship and authoritative account access (2026-10-28)

- UserService renames full_name to display_name without data loss and adds a
  lowercase unique username (ASCII a-z, 0-9, underscore; 2–30 chars). NULL means
  onboarding is incomplete. Conditional assignment and a database trigger enforce
  one-time selection, including concurrent claims; deleted names stay reserved.
- Separate friend_requests, friendships and directional user_blocks tables enforce
  self/pair constraints and unique PENDING requests across both directions.
  SERIALIZABLE transactions with bounded retries cover send, accept/reject/cancel,
  unfriend, block/unblock. Blocking removes friendship and cancels pending requests;
  unblocking restores nothing. Terminal requests use resolved_at. Pair advisory
  locks, additional audit fields and spam/cooldown/idempotency policy remain in quest.txt.
- AuthService owns account state and exposes machine-authenticated internal access,
  snapshot and deletion endpoints. Gateway checks account/session state before
  protected requests; UserService repeats it to prevent direct-call bypasses and
  verifies targets on graph writes. Existing role/ownership checks remain. Internal
  credentials and client-supplied identity headers are stripped before proxying.
  Suspended accounts cannot start new operations with still-valid access tokens;
  already-admitted work may complete. Authority unavailability fails closed with 503.
- AuthService has PATCH /auth/accounts/:id/status for current active admins. Account
  deletion now goes through AuthService. Database triggers write versioned account
  snapshots to an outbox in the same transaction; publisher sends account.events
  through Kafka; UserService ignores duplicate/stale snapshots. Migration backfills
  existing accounts. Search projection has eventual visibility; write checks use
  current authority. No sensitive account fields are exposed in social search.
- Flutter requires username onboarding after real login and opens friend management
  from “Mời bạn”. Search has a 350 ms debounce, stale-response protection, pagination,
  incoming/outgoing requests, Friends/Request Sent, block/unblock and unfriend.
  User API requests share refresh-token rotation with logout state.
- Config: provision INTERNAL_SERVICE_TOKEN (same random 32+ chars in each Node
  service's own environment); KAFKA_BROKERS and ACCOUNT_EVENTS_TOPIC in Auth/User;
  AUTH_SERVICE_URL in Gateway/User. Apply new Auth/User migrations before use
  (TYPEORM_MIGRATIONS_RUN=true). Auth/User default to loopback binding; explicit
  container bindings need private ingress. Actual .env/secrets and project databases
  were not modified. See docs/adr/ADR-006-user-social-and-account-access.md and
  docs/specs/user/social.md for API and deployment details.
- Verification: all three service/common builds passed; 178 backend tests passed,
  including 22 PostgreSQL/HTTP/Kafka integration tests on disposable infrastructure.
  Covered username races, unauthorized transitions, rollback, simultaneous opposite
  requests, accept/cancel, accept/block, send/accept, safe search, authoritative
  suspension despite stale projections, deletion, Kafka delivery and stale replay.
  Flutter analysis passed, 39 tests passed, and Android debug APK built successfully.
  No live provider login or migration against the project's databases was performed.

### Follow-up — 2026-10-30: UserService development startup

- Aligned UserService tooling with Auth/Gateway: Nest CLI 11.0.24 and schematics
  11.1.0. The previous CLI 12.0.8 dependency graph failed loading the exported
  @angular-devkit/core/node entry point. The CLI 11 toolchain runs on the existing
  Node 24.13.0 installation. Added prestart:dev to build libs/common first.
- Verified npm run dev: watch compilation reports zero errors, Nest starts, and
  the account-events consumer joins Kafka. Stopped the verification server afterward.
- During the preceding compiled-server startup check, automatic migrations applied
  UserSocial1793145600000 to the project's users database. Confirmed display_name,
  username, and the migration history entry. This supersedes the earlier note that
  no project database migrations had been run; Auth migration status was not checked.

### 2026-10-30: Username profile links

- Added authenticated GET /users/profiles/by-username/:username with exact,
  case-normalized lookup, safe profile fields, relationship state/request ID, and
  SELF. Blocks/unavailable profiles remain generic 404; reads never create requests.
- Flutter accepts cold/warm /@username routes, preserves the destination through
  login and username onboarding, and renders relationship-specific actions. Added
  copy-profile-link on the personal tab and profile navigation from friend lists.
- Chosen host: loccoc.bus-ticket.xyz, Cloudflare Pages. Android manifest and iOS
  associated-domains settings use this host. deploy/profile-links contains a static
  browser fallback and a generator using actual signing fingerprints/Apple Team ID.
  Prepared .codex-output/profile-links-site.zip for the current Android DEBUG APK.
  DNS/Pages were not deployed; iOS association/signing still needs the Apple Team ID.
- Verification: User build/lint passed; 41 User e2e tests passed on isolated
  PostgreSQL (the optional Kafka integration test skipped); Flutter analyze clean,
  all 47 Flutter tests passed, including 8 new link tests, and debug APK rebuilt.
  OS domain verification awaits real HTTPS hosting; iOS build was not run on Windows.
  See docs/specs/user/profile-links.md for deployment and identifier requirements.

### 2026-10-30: Phone validation response

- AuthService accepts phones in international +country-code format, with formatting
  punctuation stripped; Vietnamese 0375456123 is submitted as +84375456123.
- Invalid phone shape now returns 400 / INVALID_PHONE_NUMBER instead of 409, with
  an actionable format example. Registration and OTP flows share this validation.
- Added HTTP regression tests for invalid local-format input having no account/OTP
  side effects and normalized international phones retaining duplicate protection.
  See docs/specs/auth/phone-format.md. No migration is required.

### 2026-10-30: Development OTP troubleshooting

- OTP_SENDER still binds ConsoleOtpSender: development codes appear only in the
  AuthService terminal, not in real inboxes. Registering an existing email returns
  the generic accepted response without issuing a new code; use POST /auth/resend-otp
  (60-second cooldown, five sends/hour). Added regression assertions for this path.
- Account event publisher explicitly selects Partitioners.DefaultPartitioner,
  preserving KafkaJS 2 behavior while removing the partitioner selection warning.
  KafkaJS 2.2.4 requestQueue scheduleCheckPendingRequests can pass a negative delay
  to setTimeout when throttledUntil is zero; Node clamps it to 1ms and warns. This
  dependency warning is unrelated to OTP issuance and was not suppressed globally.

### 2026-10-30: Root username URLs and live Pages verification

- Switched profile sharing, Dart cold/warm routes and Android intent matching to
  https://loccoc.bus-ticket.xyz/username. /@username is no longer accepted. The
  visible @username labels in the UI remain profile handles. iOS association
  generation now matches single-segment paths excluding root and nested paths.
- User configured loccoc.bus-ticket.xyz -> loc-coc.pages.dev. Live HTTPS checks
  confirmed assetlinks.json returns 200 JSON and matches com.example.mobile_app and
  the debug signing fingerprint; /nhan_nguyen returns 200 HTML. No DNS edits made.
- Eight profile link tests passed and the Android debug APK was rebuilt. Real-device
  domain verification/deep-link launch remains to be performed after installing it.


### 2026-11-02: Settings and login history UI

- Added Profile -> Settings and Privacy -> Login History, showing server-provided
  device hints, IP, login/last-use/expiry/revocation timestamps, current-session
  badge and active/revoked/expired states. Includes refresh, pagination, retry and
  empty state. Inactive entries cannot be revoked again from UI.
- Added GET /auth/sessions/history with owner/purpose-scoped pagination and safe
  fields, reusing the existing Gateway auth mapping. New additive LoginHistory
  migration backfills available sessions and captures session insert/update in
  the same transaction. History survives expired-session removal; retain 90 days
  plus any older still-active entries. Hourly cleanup prunes old inactive history.
- Confirmed remote logout refreshes the row. Self logout invalidates local saved
  credentials while keeping account identity, disposes push/navigation state and
  returns to the chooser without offering to retain the revoked session. Final
  authentication failures take the same route after normal token refresh handling.
- Verified: AuthService build, 75 unit tests, 43 API/integration tests (18 real
  PostgreSQL session/history cases), Flutter analyzer clean, 99 Flutter tests and
  Android debug APK build. Live Gateway verified history and revoked timestamps;
  all new verification sessions were revoked. Existing app sessions were not
  targeted. iOS and physical-device UI/push validation remain unperformed.
- Restarted AuthService, applying the additive migration with existing migration
  configuration. Logs: logs/auth-login-history.stdout.log and matching stderr.log.
  No secrets changed. Already-deleted history cannot be backfilled. See ADR-011
  and docs/specs/auth/login-history.md.

### 2026-11-02: Active session management API

- Added GET /auth/sessions?limit=20&cursor=... and DELETE /auth/sessions/:id
  through the existing Gateway auth mapping. Lists only owned, nonrevoked,
  unexpired sessions with bounded device hints, IP, timestamps and isCurrent.
  No token/hash fields or administrator ownership bypass; responses use no-store.
- Targeted revocation locks the owned session and revokes all its refresh tokens
  atomically, matching refresh lock order. Redis invalidation publishes only
  after commit; database authority and push-session checks deny revoked sessions
  even if publication fails. Foreign/missing IDs share 404; repeat owned revocation
  is a no-op. Self-revocation is supported and marks isCurrent:true.
- No migration or Flutter UI change. Existing absolute expiry and hourly cleanup
  remain; this is not a long-term login history feature. ADR-010 and
  docs/specs/auth/session-management.md document the contract.
- Verified AuthService build, 75 unit tests and 37 API/integration tests (including
  12 new isolated PostgreSQL/Gateway cases). Live Gateway checks passed for list,
  foreign ownership, selected/self/repeat revocation and access/refresh rejection.
- Restarted only AuthService to load routes, leaving existing sessions in place.
  Runtime logs: logs/auth-session-management.stdout.log and matching stderr.log.
  All newly created verification sessions were revoked; no user app session was
  targeted. No secrets/configuration changed.

### 2026-11-02: Social home count and account search

- Added authenticated GET /users/me/social-summary through the existing Gateway
  users mapping; returns the exact visible accepted friend count. Pending, blocked,
  suspended/deleted and unnamed accounts are excluded. No new database schema.
- Profile displays the API count, unknown/error/retry states and refreshes on
  resume, pull-to-refresh, profile entry and return from social screens. Number
  opens the real friends list. Both duplicate hard-coded profile friend totals
  were replaced.
- Added prominent home account search entry, reusing debounce, pagination,
  stale-response protection and safe username profiles. Redesigned the foreign
  profile card and relationship section. Plus now indicates future content
  creation instead of opening account search.
- User explicitly deferred all moments/posting work. No content migration or API
  was added. ADR-009-social-home-and-search.md and specs/user/home-and-search.md
  describe the final scope.
- Verification: UserService build and 25 unit tests passed; isolated real PostgreSQL
  social/Gateway suite 24 passed (one Kafka test skipped); Flutter analyzer clean,
  full Flutter suite 90 passed. Live Gateway reports one friend for each authorized
  antony2/antony4 test account; verification sessions logged out.
- Android debug APK built successfully with the new interfaces. iOS/device UI
  validation was not run in this Windows session.

### 2026-11-02: Remembered accounts and persistent mobile sessions

- Account identity is now always remembered on mobile. Removed storage choices
  from password/Google login. Session-retention consent is requested on logout
  only when the departing account has no valid saved session.
- Shared Home/onboarding dialog offers save, identity-only logout, or cancel.
  Retained logout skips the question next time, keeps the server session, strictly
  detaches push and returns to the chooser without automatic re-entry. Identity-only
  logout revokes the server session while preserving the account entry.
- The chooser labels saved-session/identity-only states and separately offers
  revoking a saved session (keep account) and removing the entire device entry.
- Origin-scoped flutter_secure_storage vault persists refresh credentials only,
  never passwords/access tokens. Serialized refresh consumes the durable token
  before rotation and awaits replacement persistence; interrupted refresh requires
  login again. Saving at logout atomically persists token plus inactive state.
- Navigation/profile state and push listeners are detached on account changes;
  outstanding push registration completes before strict detachment.
- Android backup is disabled; iOS device-only Keychain has an installation marker
  to prevent inheriting credentials after reinstall. Biometrics are not included.
- Decisions/behavior: docs/adr/ADR-008-remembered-accounts.md and
  docs/specs/auth/remembered-accounts.md. iOS/device push checks remain required.
- Verification after logout interaction update: analyzer clean, 87/87 Flutter
  tests passed, Android debug APK built successfully.

### 2026-11-02: Live friendship and notification verification

- Verified authorized antony2/antony4 test accounts through the running Gateway:
  send/accept in both directions, duplicate and authorization rejection, notification
  ownership, seen/read counts and idempotent read timestamps.
- Verified inbox delivery while the recipient's verification session was logged out,
  then successful retrieval after login. This does not verify device offline push.
- Four source outbox events were published and four matching inbox notifications
  persisted. Accounts remain friends; verification sessions were logged out.
- Actual FCM/device delivery remains unverified: zero registered devices/jobs and
  missing configured secrets/firebase-admin.json. No secrets/configuration changed.
- Evidence: docs/specs/notification/live-verification-2026-11-02.md.

### 2026-10-30: Flutter self-serve account deletion

- Added `UserApiClient.deleteAccount()` sending `DELETE /users/me` with bearer token and automatic token refresh upon encountering 401.
- Added `GoogleAuthService.clearSession()` exposing local session teardown and adapter sign-out.
- Implemented **Xóa tài khoản** button on Profile tab in `HomeScreen` with confirmation dialog warning users that the account will be permanently disabled and unrecoverable.
- Multiple-click prevention: button disables while deletion is in flight (`_isDeletingAccount` flag) with inline loading indicator.
- Success flow: clears `ProfileLinkSession`, clears `GoogleAuthService` session, resets navigator stack to `AuthScreen` via `pushAndRemoveUntil`, and shows success snackbar.
- Failure flow: session is preserved, user stays on `HomeScreen`, button resets from loading state, and actionable error message is shown via `userError`.
- Architecture compliance: soft delete is preserved (`deleted_at = now()` in PostgreSQL `accounts` table, broadcast via Kafka `account.events` outbox to `user-service` projection); no hard deletion performed.
- Verification: 54 / 54 Flutter tests passing (including 7 new tests in `test/account_deletion_test.dart`), `flutter analyze` clean (0 warnings), `flutter build bundle` clean. Backend test suites (`user-service`: 25 passed, `auth-service`: 75 passed) all green.

### 2026-11-10: Rolling display-name cooldown (Q2)

- Implemented the approved rolling 30-day policy for display names. Initial
  nonempty naming and saving an identical trimmed/NFC name do not count. Blank/null
  profile names cannot reset the allowance. Immutable usernames are unchanged.
- Profile updates and username onboarding share a PostgreSQL row-locked writer.
  Counted timestamps use database time; concurrent renames cannot consume the same
  allowance. Rejected names roll back the entire profile/username request.
- Admin overrides require the admin role, preserve the user's cooldown timestamp
  (including database precision), and atomically log actor/target/old/new/time.
  Admin-only GET /users/:id/display-name-history provides paginated audit records.
- GET/PATCH profiles and cooldown conflicts expose nextDisplayNameChangeAt.
  The existing Gateway /users mapping was verified without adding a redundant route.
- Flutter's Profile > Edit profile now edits display names, shows the policy/next
  date, prevents repeated submissions and refreshes displayed/cached profile names.
- Migration DisplayNameCooldown1794268800000 preserves names, adds a nullable
  last counted-change timestamp and a durable audit table. It is registered for
  startup/explicit migrations; no historical changes are inferred for existing users.
- Verified: all four NestJS services build; UserService 62 unit tests and 56 E2E
  tests passed (real PostgreSQL, JWT authority and Gateway). Six unrelated Kafka/
  outbox integration cases were skipped by their existing environment gates.
  Gateway 16 E2E tests and 17 focused Flutter tests passed; UserService lint,
  Flutter analyze and diff whitespace checks are clean.
- Decision/spec: docs/adr/ADR-013-display-name-cooldown.md and
  docs/specs/user/display-name-cooldown.md. Smart-discovery decisions were
  subsequently confirmed as recorded below.

### 2026-11-10: Smart friend discovery product decisions confirmed

- Updated ADR-012 and the discovery specification with the user's follow-up
  design and approval of review questions 1/2/4/5; question 3 selects a 30-day
  bilateral suggestion cooldown after unfriend. Other cooldowns: dismiss 90 days
  one-way, reject 30 days bilateral, cancel 7 days bilateral. These do not block
  manual search/invitations; pending excludes recommendations.
- Privacy flags default true. Hidden intermediaries lose identity/count at the
  final PostgreSQL check. A hidden target's entire mutual section is suppressed
  across profile/search/suggestion cards; the target can still view permitted
  mutuals elsewhere. Stale third-party ranking influence remains accepted.
- Search: exact @username, name relevance, graph proximity. Suggestions prioritize
  2-hop then 3-hop fill, with connection score within groups. Keep Home search;
  add a Friends tab, privacy settings and cold-start link sharing/QR guidance.
- Cache TTL starts at 10 minutes, graph-lag budget at 30 seconds, both configurable.
  Neo4j failure allows unexpired Redis suggestions within the freshness budget
  after final filtering; Redis failure/excessive lag shows maintenance. Text search
  continues through PostgreSQL without mutual data during either dependency failure.
- Preserve notification-only social.events and existing account.events; add
  social.graph.events, canonical pair versions/durable watermarks and independent
  profile versions. Accept rare stale Redis publication without cross-store
  generation coordination; PostgreSQL eligibility checks remain mandatory.
- Local Neo4j Compose setup is part of the design; super-node handling is deferred.
  This update changes documentation only. No runtime feature, migration, Docker
  configuration or production data was changed; implementation checks remain pending.

### 2026-11-10: Smart friend discovery implemented and verified

- Added SmartDiscovery1794355200000, preserving existing users/relationships:
  unaccent/trigram normalized-name search, true/true privacy defaults, independent
  profile/pair versions, durable cooldown feedback, separate graph outbox,
  projection offsets, refresh queue and viewer-bound expiring cursor sessions.
- Existing SERIALIZABLE social mutations now lock canonical pair rows. Source
  triggers write full pair/profile snapshots transactionally, including admin,
  onboarding and deletion of graph relationships. Notification-only social.events
  and its publisher remain unchanged. Independent social.graph.events/account.events
  consumption applies account/profile versions separately and retains pair watermarks.
- Added private authenticated Neo4j 5.26.33 Community Compose service and HTTP
  adapter, persistent volume, health check and three-second transaction timeout.
  Runtime bootstraps/reconciles from source snapshots, monitors progress/backlog,
  periodically refreshes Top-500 Redis lists and uses generation-checked Lua with
  ownership-token locks. TTL 600 seconds and conservative lag budget 30 seconds
  are configurable. Source eligibility checks remain authoritative after stale
  graph reads or Redis generation loss; no neighbor invalidation/super-node policy.
- Added Vietnamese q/cursor search alongside preserved username/page search,
  recommendations/dismiss, privacy and mutual-detail APIs. All routes use existing
  Gateway users mapping. Final PostgreSQL reads recheck relations/privacy/feedback;
  mutual count is exact and candidate lists identify projection gaps with partial.
  Hidden/unavailable evidence has no numeric count. Dependency outages preserve
  text search; unexpired suggestions serve only within the freshness policy.
- Flutter has Home name/username search, a separate Friends tab with suggestions,
  dismiss, privacy settings, profile/card mutual summaries/detail, cold-start
  link copy/share plus QR and stale-response suppression after local block.
- Verified: UserService build, 73 unit tests and 87 E2E/integration tests passed
  without skipped cases, including real PostgreSQL/Neo4j/Redis/Kafka and Gateway
  authentication/ownership checks. Flutter analyzer clean, 114 tests passed and
  Android debug APK built at MobileApp/build/app/outputs/flutter-apk/app-debug.apk.
  Compose config and documentation links/whitespace verified. Existing Firebase
  Android plugin emits a future Kotlin migration advisory; current APK build passes.
- Tests used a dedicated disposable database/schema, isolated Neo4j container,
  unique Kafka topics/group and UUID-scoped Redis keys; temporary resources were
  removed. Existing local .env secrets and live business tables were untouched.
  Existing-environment activation requires matching new NEO4J_PASSWORD values in
  root/UserService local .env, Neo4j startup, the registered migration and a
  UserService restart. iOS/device interaction and workload benchmarks remain
  unverified. Full API/deployment/rebuild/rollback guide:
  docs/specs/user/smart-discovery-operations.md; product decisions: ADR-012.


### 2026-11-10: Smart discovery hardening [1]–[8]

- Replaced destructive pair cache invalidation with generation-incrementing Lua
  pruning that preserves remaining PTTL/IDs, including delayed Kafka pair events.
  Dismiss touches only its viewer. Flutter changes only affected cards/search
  relationship state and retains loaded pages/cursors. Block acknowledgement also
  advances the response epoch to reject reads begun while the write was in flight.
- Search retrieves global PostgreSQL candidates once, parallel with Neo4j, then
  ranks a bounded ID union with current PostgreSQL visibility/text checks. Query
  normalization strips @, NFC-normalizes and collapses whitespace before minimum
  length validation in both DTO/repository and Flutter.
- Added DiscoveryRefreshLeases1794441600000 after SmartDiscovery: priority 0/1/2,
  request revisions, token/30-second leases and retry availability. On-demand
  upserts promote work while preserving its original queue position. Atomic
  SKIP LOCKED claims commit before up to three concurrent computations; only
  matching completed leases/revisions are acknowledged. Locked/failed/stale work
  is retained and newer requests survive old worker completion. Monitoring and
  refresh loops run independently to prevent graph work delaying health checks.
- Two-hop candidates now score only distinct eligible common bridges. Three-hop
  traversal runs only to fill remaining Top-500 slots, excluding two-hop IDs.
  Bootstrap uses UUID tuple keyset; Kafka checks listTopics before creating the
  graph topic. Typed discovery environment validation requires URL/password when
  enabled outside tests. Blocking an existing friend writes bilateral UNFRIEND
  30-day feedback transactionally; repeated block does not extend it.
- Home retains FriendsScreen/subtab state in IndexedStack with lazy first load.
  Unchanged profile return keeps pagination; changed peers refresh individually.
  Profile buttons moved below names; zero/hidden/unavailable mutual chips omitted.
- Verified required checks: shared/common and all four Node service builds PASS;
  UserService lint clean and 91 unit tests PASS; AuthService 77 unit tests PASS;
  Gateway 16 E2E PASS; UserService full-stack 94 E2E PASS with 0 skipped; Flutter
  analyzer 0 issues and all 121 tests PASS. git diff whitespace check is clean.
- Reusable scripts/verify-discovery-e2e.mjs generates process-only credentials,
  starts UUID-named disposable PostgreSQL 17/authenticated Neo4j 5.26.33 on random
  loopback ports, sets all test URLs, invokes npm test:e2e and removes containers
  in finally. Tests use UUID-scoped Redis keys/Kafka topics and isolated schemas.
  Real Gateway tests verify both search branches, exact username/graph ranking,
  actual mutuals, preparing->ready, maintenance and preserved remaining cards
  after send/dismiss; queue tests cover claims/ownership/revisions/lock contention.
- Existing .env/secrets/live business data were not changed. Current local Neo4j
  password/URL are not configured; activation requires local configuration and
  both registered migrations. Physical-device/iOS checks, a new APK build,
  workload benchmarks and super-node policy are outside this follow-up.
- Evidence: docs/specs/user/smart-discovery-hardening-report.md; updated ADR-012,
  smart-friend-discovery.md and smart-discovery-operations.md.
