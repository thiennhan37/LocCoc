# Technical Specification: Tier Catalog & Subscription Management

## 1. Overview
Đặc tả module `admin-service` trong hệ thống LocCoc, chịu trách nhiệm quản lý danh mục gói dịch vụ (Tier Catalog), phân quyền động (Role-Based Access Control / Feature Gating), can thiệp thủ công (Admin Manual Override) và ghi nhật ký kiểm toán (Audit Logging).

## 2. Data Models (MySQL - `admin_db`)

### 2.1. `tiers`
- `id` (VARCHAR(36), PK): UUID của Tier.
- `code` (VARCHAR(50), UNIQUE): Mã định danh (vd: `FREE`, `PRO`, `VIP`, `ENTERPRISE`).
- `name` (VARCHAR(100)): Tên hiển thị.
- `monthly_price` (DECIMAL(12,2)): Giá theo tháng (VND).
- `yearly_price` (DECIMAL(12,2)): Giá theo năm (VND).
- `features` (JSON): Danh sách tính năng và quyền hạn (`["UNLIMITED_SYNC", "AI_SUGGESTION", "PRIORITY_SUPPORT"]`).
- `max_devices` (INT): Số thiết bị tối đa cho phép đồng bộ.
- `is_active` (BOOLEAN): Trạng thái kích hoạt.

### 2.2. `audit_logs`
- `id` (BIGINT AUTO_INCREMENT, PK)
- `actor_id` (VARCHAR(36)): ID người thực hiện thao tác (Admin).
- `action` (VARCHAR(100)): Loại hành động (vd: `TIER_CREATE`, `TIER_UPDATE`, `SUBSCRIPTION_MANUAL_OVERRIDE`).
- `target_type` (VARCHAR(50)): Loại đối tượng bị tác động (`TIER`, `USER_SUBSCRIPTION`).
- `target_id` (VARCHAR(36)): ID đối tượng bị tác động.
- `details` (JSON): Chi tiết thay đổi trước và sau khi thực hiện (Diff payload).
- `ip_address` (VARCHAR(45)): Địa chỉ IP của Admin.
- `created_at` (DATETIME): Thời điểm thực hiện.

## 3. API Endpoints

### 3.1. Quản lý Gói (Admin Tier Endpoints)
- `GET /admin/tiers`: Danh sách tất cả các gói dịch vụ (kèm bộ lọc active/inactive).
- `POST /admin/tiers`: Tạo gói dịch vụ mới (yêu cầu role `SUPER_ADMIN`).
- `PUT /admin/tiers/{id}`: Chỉnh sửa thông tin giá và quyền hạn của gói.
- `DELETE /admin/tiers/{id}`: Vô hiệu hóa gói (soft delete).

### 3.2. Can thiệp Subscription (Admin Override)
- `POST /admin/subscriptions/override`:
  - Request: `{ "userId": "...", "tierCode": "VIP", "durationDays": 30, "reason": "Compensation for outage" }`
  - Ghi Audit Log hành động `SUBSCRIPTION_MANUAL_OVERRIDE`.
  - Bắn event Kafka sang topic `subscription.events`.

### 3.3. Nhật ký kiểm toán (Audit Logs)
- `GET /admin/audit-logs`: Truy vấn lịch sử thao tác với phân trang, lọc theo `actorId`, `action`, `targetType`, khoảng thời gian `from` - `to`.
