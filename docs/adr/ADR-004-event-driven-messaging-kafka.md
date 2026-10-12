# ADR-004: Event-Driven Messaging with Apache Kafka

## Status
Accepted

## Context
Khi sự kiện thanh toán thành công hoặc gói dịch vụ của người dùng được nâng cấp/hủy bỏ trong `payment-service` và `admin-service`, các service khác (như `user-service`, `auth-service`, hệ thống Notification / Audit) cần nhận được thông tin để cập nhật trạng thái quyền hạn (Permissions / Roles / Claims) và gửi thông báo cho người dùng mà không tạo ra khớp nối đồng bộ (Synchronous Coupling).

## Decision
Sử dụng **Apache Kafka** làm Message Broker cho toàn bộ hệ sinh thái Microservices:
1. **Kafka Broker**: Dockerized Apache Kafka (KRaft mode, Port `9092`), kết hợp Kafbat UI (Port `9080`) để trực quan hóa topic và message.
2. **Topics chuẩn hóa**:
   - `payment.events`: Bắn ra khi có giao dịch thanh toán được khởi tạo (`PAYMENT_CREATED`), thành công (`PAYMENT_SUCCESS`), hoặc thất bại (`PAYMENT_FAILED`).
   - `subscription.events`: Bắn ra khi người dùng được kích hoạt gói mới (`SUBSCRIPTION_UPGRADED`), gia hạn (`SUBSCRIPTION_RENEWED`), hoặc hết hạn (`SUBSCRIPTION_EXPIRED`).
   - `admin.audit`: Bắn ra các thao tác nhạy cảm của Admin (Override Tier, Block User, Revoke Key).
3. **Payload Chuẩn (Standard Event Envelope)**:
   Mọi event đều chứa: `eventId` (UUID), `eventType`, `timestamp`, `aggregateId` (userId / orderCode), `data` (JSON Object), `version`.

## Consequences
- **Ưu điểm:**
  - Decoupling hoàn toàn giữa Payment, Admin, User và Auth services.
  - Khả năng Replay sự kiện khi cần khôi phục dữ liệu hoặc đồng bộ dịch vụ mới.
  - Hiệu năng cao, khả năng chịu tải hàng ngàn giao dịch/giây.
- **Thách thức:**
  - Cần xử lý Consumer Idempotency để tránh xử lý trùng lặp event.
