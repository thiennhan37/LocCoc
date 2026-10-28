# LocCoc Project Context & Knowledge Base (Admin & Payment Module)

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
