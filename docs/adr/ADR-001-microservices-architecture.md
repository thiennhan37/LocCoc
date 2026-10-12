# ADR-001: Microservices Architecture & Service Boundaries

* **Trạng thái:** Accepted
* **Ngày quyết định:** 2026-10-04
* **Phạm vi:** Toàn bộ hệ thống LocCoc IAM & Subscription Platform

---

## 1. Ngữ Cảnh (Context)
Hệ thống LocCoc phục vụ cả ứng dụng di động (Flutter) và quản trị viên (Admin Web), với các nghiệp vụ độc lập:
- Xác thực danh tính & JWT Management (`auth-service`).
- Quản lý thông tin & Profile người dùng (`user-service`).
- Quản lý gói cước, phân quyền quản trị, kiểm toán thao tác (`admin-service`).
- Tích hợp thanh toán PayOS VietQR, xử lý webhook, quản lý Subscription (`payment-service`).

## 2. Quyết Định (Decision)
- Sử dụng kiến trúc **Microservices** phân tách theo **Bounded Context** (Nghiệp vụ), có **API Gateway** làm Reverse Proxy duy nhất.
- Giao tiếp đồng bộ Client $\rightarrow$ Server qua REST API (chuyển tiếp qua Gateway kèm `x-request-id`, `x-user-id`).
- Giao tiếp bất đồng bộ giữa các service qua **Apache Kafka**.

## 3. Hệ Quả & Đánh Đổi (Trade-offs)
- **Ưu điểm:** Độc lập triển khai, bảo mật cao (ngắt kết nối trực tiếp từ client vào DB), dễ dàng mở rộng và scale từng module.
- **Thách thức:** Cần quản lý tính nhất quán dữ liệu (Eventual Consistency) và cấu hình routing qua Gateway.
