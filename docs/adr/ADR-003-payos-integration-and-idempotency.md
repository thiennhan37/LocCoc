# ADR-003: PayOS Payment Integration & Idempotency Strategy

## Status
Accepted

## Context
Dự án cần hỗ trợ phương thức thanh toán chuyển khoản ngân hàng tự động (VietQR / Napas247) tại thị trường Việt Nam cho các gói dịch vụ (PRO, VIP, ENTERPRISE). Cần bảo đảm:
- Tích hợp nhanh, chuẩn xác qua PayOS SDK 2.x trên nền tảng Java Spring Boot 3.
- Bảo đảm tính toàn vẹn (Integrity) và chống gian lận (Anti-tampering / Anti-replay).
- Ngăn chặn Double-Charging hoặc Double-Fulfillment khi Webhook được gọi lại nhiều lần (At-least-once delivery).

## Decision
1. **SDK & API Version**: Sử dụng `vn.payos:payos-java:2.0.1` với endpoint v2 (`vn.payos.model.v2.paymentRequests.CreatePaymentLinkRequest`).
2. **Bảo mật Webhook**:
   - Sử dụng phương thức `payOS.webhooks().verify(webhookBody)` để xác minh chữ ký HMAC SHA256 với `PAYOS_CHECKSUM_KEY`.
   - Endpoint Webhook luôn phản hồi `HTTP 200 OK` (kể cả khi nhận test order từ PayOS ping) để tránh PayOS đánh dấu webhook URL không hợp lệ (`Webhook url invalid`).
3. **Idempotency & Concurrency Control**:
   - Khóa phân tán (Distributed Locking) qua Redis (`lock:order:<orderCode>`) trong thời gian xử lý webhook.
   - Kiểm tra trạng thái giao dịch trong MySQL (`payment_transactions.status`). Nếu đã ở trạng thái `PAID` hoặc `COMPLETED`, bỏ qua việc cộng thêm thời hạn nhưng vẫn trả về `HTTP 200 OK`.

## Consequences
- **Ưu điểm:**
  - Tuyệt đối an toàn trước các cuộc tấn công giả mạo Webhook.
  - Xử lý mượt mà kịch bản mạng chập chờn khi webhook retry nhiều lần.
  - Tự động kích hoạt Subscription Tier ngay lập tức cho người dùng sau khi quét mã VietQR.
