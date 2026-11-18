# Kiểm tra toàn dự án — 15/11/2026

## Kết luận

**Chưa đạt trạng thái toàn hệ thống chạy thành công.** Trong phạm vi checkout
`feature/smartly-seeking-moments`, 754 test đạt và 2 test thất bại. Build TypeScript,
dashboard và APK Android đạt; build Admin/Payment mặc định thất bại trên JDK 24,
nhưng thành công khi bật annotation processing bằng tham số dòng lệnh. Có các
khoảng trống phân quyền và tích hợp Billing/Admin cần xử lý trước khi xác nhận
end-to-end toàn hệ thống.

Kiểm tra này gồm build/test các module hiện có, analyzer/lint, Compose và rà soát
có trọng tâm về Gateway, Admin, Payment, dashboard và hợp đồng dữ liệu. Không phải
pentest, kiểm thử tải, kiểm toán dependency CVE hoặc review từng dòng toàn repo.
Không sửa mã nghiệp vụ, secrets hay merge nhánh. Các thay đổi sẵn có được giữ lại.

## Kết quả tự động

| Module | Build / phân tích | Test đạt | Test lỗi |
| --- | --- | ---: | ---: |
| Auth | Build đạt | 77 unit + 43 E2E = 120 | 0 |
| User / Social / Discovery / Profile media | Build + lint đạt | 125 unit + 94 E2E + 9 S3/media E2E = 228 | 0 |
| Notifications | Build + lint đạt | 4 unit + 21 integration = 25 | 2 |
| Moments | Build đạt | 13 unit + 10 integration = 23 | 0 |
| Python AI | Ruff + `pip check` đạt | 32 regression + 1 Redis quota integration = 33 | 0 |
| NestJS Gateway | Build đạt | 25 E2E | 0 |
| Spring Gateway | Build trong Maven test đạt | 21 | 0 |
| Flutter | Analyzer sạch; APK debug đạt | 279 | 0 |
| **Tổng** | | **754** | **2** |

Các test PostgreSQL/S3 bị skip trong lần chạy không có biến TEST đã được chạy
riêng với dependency thật sau đó. 9 test media bị skip trong runner Discovery
đã chạy đầy đủ ở runner media. 23 test Notifications bị skip trong unit run đã
được chạy đủ: 21 đạt, 2 lỗi. Không cộng trùng những lần chạy này.

Dashboard `next build` và TypeScript đạt. ESLint báo **8 errors, 45 warnings**,
chủ yếu `no-explicit-any` và `prefer-const`; dashboard không có script test riêng.

Admin và Payment không có `src/test`: package thành công không chứng minh logic
thanh toán, chữ ký, phân quyền hoặc nâng cấp Tier đã có test. Đây cũng là khoảng
trống so với yêu cầu test trong AGENTS.md.

### Java toolchain

- JDK đang sử dụng: 24.0.2; Admin/Payment khai báo Java target 17.
- Build mặc định của cả hai thất bại với getter, builder, constructor và `log`
  do Lombok không được chạy.
- Cả hai package thành công bằng:

```powershell
mvn -B -q -f admin-service/pom.xml '-Dmaven.compiler.proc=full' package
mvn -B -q -f payment-service/pom.xml '-Dmaven.compiler.proc=full' package
```

Chưa sửa `pom.xml`, đổi JDK hoặc ghi cấu hình máy. Cần chuẩn hóa JDK được hỗ trợ
hoặc cấu hình annotation processor trong build trước khi coi lệnh mặc định đạt.

## Phát hiện cần xử lý

### P1 — Admin/Billing chưa có ranh giới xác thực, phân quyền đầy đủ

Nest `GatewayAccountAccessGuard` xác minh tài khoản rồi cho qua, không kiểm tra
quyền Admin đối với `/admin/*`. `ServiceProxyController` chuyển tiếp route Admin.
Các controller Admin không kiểm tra role hoặc service credential. Header
`x-user-id` được tin trực tiếp, thậm chí mặc định thành `1` khi gọi thẳng service.

Spring Gateway chỉ gọi rate limiter rồi proxy; không xác minh account/JWT hoặc
quyền Admin. Nó còn loại `x-user-id` trước khi chuyển tiếp, trong khi các Java
controller mặc định ID thành `1`. Hai Gateway hiện không bảo đảm cùng hành vi bảo
mật cho Admin/Billing.

Nguồn:

- `api-gateway/src/account-access.guard.ts:59`
- `api-gateway/src/service-proxy.controller.ts:69`
- `admin-service/src/main/java/com/loccoc/admin/controller/TierAdminController.java:34`
- `api-gateway-spring/src/main/java/com/loccoc/api_gateway/controller/GatewayController.java:34`
- `api-gateway-spring/src/main/java/com/loccoc/api_gateway/service/ProxyService.java:82`
- `payment-service/src/main/java/com/loccoc/payment/controller/SubscriptionController.java:21`

Đây là kết luận từ mã và cấu hình, chưa phải khai thác thực tế trên Admin/Payment
đang chạy. Cần xác minh JWT/live account, kiểm tra role/ownership tại ranh giới
service và bỏ danh tính mặc định; kiểm thử qua cả hai Gateway và gọi trực tiếp.

### P1 — Hợp đồng danh tính IAM UUID không khớp Billing/Admin Long

Nest Gateway ghi UUID đã xác thực vào `x-user-id` ở
`api-gateway/src/service-proxy.controller.ts:156`. Java checkout, subscription,
Admin mutations và entity subscription/payment dùng `Long` cho user/admin ID.

Ví dụ: `PaymentController.java:21`, `SubscriptionController.java:21`,
`TierAdminController.java:36`, `payment/model/entity/PaymentTransaction.java:28`.
UUID thực không thể được bind thành Long; đường đi qua Nest dự kiến trả lỗi bind
400 trước khi xử lý. Không thể dùng việc gọi service bằng ID demo số để kết luận
checkout/subscription hoạt động với tài khoản IAM thật.

Đây là xung đột hợp đồng xác nhận từ mã; chưa thực hiện checkout PayOS thật.
Cần thống nhất UUID hoặc có ánh xạ danh tính được thiết kế, thay vì tin header
client hay dùng fallback `1`.

### P1 — Idempotency thanh toán chưa an toàn khi webhook đến đồng thời

`SubscriptionService.java:53` đọc transaction bằng `findByOrderCode`, kiểm tra
`SUCCESS`, rồi ghi status và cộng thêm thời hạn subscription. Repository không
có locking query; entity không có optimistic version; cập nhật trạng thái không
dùng điều kiện `WHERE status = ...`/compare-and-set.

Hai transaction cùng đọc PENDING có thể đều vượt qua kiểm tra và cấp quyền/cộng
thời hạn hai lần. `@Transactional` và unique `order_code` không tự tuần tự hóa
việc xử lý một row đã tồn tại. Đây là phát hiện từ mã, chưa tái hiện race bằng
MySQL. Cần locking/CAS cho transaction và bài test webhook replay đồng thời.

Webhook **có chặn cập nhật thanh toán khi verify chữ ký thất bại** qua điều kiện
`verifiedData != null`; không phát hiện bypass chữ ký ở điều kiện này. Tuy vậy,
`PayOSWebhookController.java:56` trả 200 ngay cả khi xử lý lỗi, và log raw payload.
Lỗi lưu DB sau verify có thể bị acknowledge, làm mất cơ hội retry của provider;
cần tách rõ lỗi xác minh, probe và lỗi xử lý tạm thời, đồng thời giảm log dữ liệu.

### P1 — Dashboard có thao tác thành công giả, chưa nối nghiệp vụ thật

`admin-dashboard/src/lib/api-client.ts:63` (`updateUserStatus`) và `:104`
(`saveTier`) chỉ sửa các mảng RAM, kể cả khi UI đang bật Live. UI vẫn thông báo
đã khóa tài khoản/đã cập nhật. Refresh trang sẽ mất thay đổi; tài khoản thật và
Tier thật không bị cập nhật bởi các hàm này.

Các GET Live không gắn Authorization, mặc định cổng 3000 thay vì Gateway hiện tại
8080, và một số route không khớp backend (`/admin/reports/analytics` so với
`/admin/reports/overview`; `/admin/users` và `/payments/history` chưa có controller
tương ứng trong checkout). Response backend bọc trong ApiResponse/Page trong khi
client nhận trực tiếp như model/mảng. Lỗi tiếp tục fallback dữ liệu mock.

Cần tách trạng thái demo/live rõ ràng, ánh xạ contract/token/URL, nối mutation
thật và trả lỗi thay vì báo thành công từ thao tác RAM.

### P2 — Hai test Notifications thiếu migration phụ thuộc

Hai test lỗi:

1. `creates source outbox atomically for send/accept, not cancellation`
2. `delivers transactional outbox through real Kafka and safely replays`

Cùng lỗi `function lock_social_pair(unknown, unknown) does not exist` tại
`user-service/src/social/social.repository.ts:216`.
Setup `notification-service/test/inbox.postgres.spec.ts:65` chỉ nạp các migration
User ban đầu và SocialOutbox; thiếu `SmartDiscovery1794355200000` cung cấp hàm này.
Production `USER_MIGRATIONS` có migration đó. Vì vậy thất bại hiện tại xác nhận
fixture test bị lệch schema; không đủ để kết luận production thiếu hàm.

Cần dùng schema/migration đúng hợp đồng trước khi gọi SocialRepository trong
notification suite, rồi chạy lại cả outbox và Kafka replay. Không sửa fixture
trong lần kiểm tra này; kết quả đỏ được giữ nguyên trong báo cáo.

### P2 — Các DB Tier/Subscription độc lập nhưng chưa có đường đồng bộ

Admin dùng `admin_db`, Payment dùng `payment_db`; cả hai có repository/entity
`Tier` và `UserSubscription` riêng. TierAdminService ghi repo Admin, còn checkout
đọc repo Payment. Chưa tìm thấy consumer/projection hoặc service API đồng bộ Tier
giữa hai bên. Việc sửa Tier Admin chưa chứng minh thay đổi được Tier dùng tính
phí. Cần xác định một nguồn sở hữu nghiệp vụ và cơ chế đồng bộ rõ ràng; không giải
quyết bằng cách cho hai service dùng chung schema.

## Runtime và giới hạn

- Auth :8000 đang phản hồi HTTP; login/JWT thật đã được xác minh ở lượt trước.
- Gateway :8080 `/health`, AI :8087 `/health/live`, Moments :8088 `/health/live`
  đều trả 200 trong lượt kiểm tra này.
- User :8081, Notifications :8084, Payment :8085, Admin :8086 và dashboard :3005
  không chạy tại thời điểm probe. Build/test của các module này không được báo
  thành một deployment sống đã chạy chung đầy đủ.
- Chat không có source/package trong checkout hiện tại. Ở lượt trước, bản archive
  nhánh `chat-service` đạt 32 test chat; chưa merge hoặc chạy chung với checkout
  hiện tại. Chi tiết ở báo cáo Moments ngày 15/11.
- Docker Compose với profile `media` và `moments` kiểm tra config thành công.
- Không chạy iOS build trên Windows, UI tương tác bằng emulator/browser, test tải,
  giao dịch PayOS, webhook registration, email/push provider thật hoặc CVE audit.
- AI mock được dùng toàn bộ đợt kiểm tra này: **0 lượt gọi Gemini mới**. Hai lượt
  API thật ở yêu cầu trước không được lặp lại.

## Tái chạy và bằng chứng

```powershell
pnpm run build
pnpm --filter auth-service --filter user-service --filter notification-service --filter moment-service test
pnpm --filter api-gateway test:e2e
pnpm --filter user-service --filter notification-service lint
pnpm --filter admin-dashboard lint
pnpm --filter admin-dashboard build
node scripts/verify-discovery-e2e.mjs
node scripts/verify-iam-notifications-media.mjs
node scripts/verify-moments.mjs
mvn -B -q -f api-gateway-spring/pom.xml test
cd ai-service
.venv/Scripts/python.exe -m pytest -q
.venv/Scripts/python.exe -m ruff check app tests integration scripts
.venv/Scripts/python.exe -m pip check
cd ../MobileApp
flutter analyze
flutter test --reporter compact
flutter build apk --debug --dart-define=MOMENTS_ENABLED=true
```

Runner mới `scripts/verify-iam-notifications-media.mjs` tạo PostgreSQL/S3 tạm,
chạy Auth/Notifications/media và dọn tài nguyên trong `finally`; Kafka chỉ dùng
topic fixture ngẫu nhiên của suite. Nó không gọi provider email/push/Gemini thật.
Không trỏ NOTIFICATION_TEST_DB_URL vào DB dự án: test có migration/truncate.

Log cục bộ dưới `logs/full-project-*.log`, JSON runner tại
`logs/full-project/iam-media-0b978627.json`; Spring reports trong
`api-gateway-spring/target/surefire-reports/`. APK:
`MobileApp/build/app/outputs/flutter-apk/app-debug.apk`.

`git diff --check`, cú pháp Node runner, Python dependency consistency đều đạt.
Các container tạm của runner đã được dọn; container dữ liệu dự án được giữ nguyên.

Thứ tự khắc phục đề nghị: ranh giới bảo mật và UUID Billing/Admin → idempotency
và test payment → nối dashboard thật → fixture Notifications → chuẩn hóa Java
toolchain/lint → tích hợp chat và chạy acceptance liên service đầy đủ.
