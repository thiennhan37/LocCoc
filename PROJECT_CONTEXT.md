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
