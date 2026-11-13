# Spring MVC API Gateway

Java 21, Spring Boot 4.1.1, Redis. Gateway không dùng JPA hoặc database nghiệp vụ.

## Chạy

Dừng gateway NestJS nếu đang dùng port 8080. Bật Redis và các service cần sử dụng, sau đó:

```powershell
cd D:\workspace\LocCoc\api-gateway-spring
.\mvnw.cmd test
.\mvnw.cmd spring-boot:run
```

Tự đọc `.env` tại thư mục hiện tại hoặc thư mục cha; biến môi trường có ưu tiên cao hơn file. Xem `src/main/resources/application.properties` để biết defaults. Không đưa secrets vào source.

| Prefix | Biến URL | Mặc định |
|---|---|---|
| /auth | AUTH_SERVICE_URL | http://localhost:8000 |
| /users | USER_SERVICE_URL | http://localhost:8081 |
| /admin | ADMIN_SERVICE_URL | http://localhost:8086 |
| /payments, /subscriptions | PAYMENT_SERVICE_URL | http://localhost:8085 |

Giữ prefix, query, method, body nguyên gốc, Authorization, cookie và HTTP status từ upstream; giữ nguyên body thành công. Không retry hoặc follow redirect. Hỗ trợ HTTP request/response; không hỗ trợ WebSocket/SSE hoặc streaming file lớn.

## Các lớp

- `controller`: nhận request, gọi service; health `/` và `/health` là liveness cục bộ.
- `service`: proxy HTTP, quota và xử lý lỗi upstream.
- `repository`: lưu quota Redis, Lua INCR/PEXPIRE nguyên tử; không cần entity/JPA.
- `configuration`: cấu hình URL, HTTP client, CORS.
- `dto`: ApiResponse<T>, RateLimitDecision.
- `exception`: ErrorCode, AppException và GlobalExceptionHandler (RestControllerAdvice).
- `filter`: request ID và security headers.

`RATE_LIMIT_MAX` (100), `RATE_LIMIT_TTL_MS` (60000): quota chung cho các route theo socket IP, dùng chung giữa các instance. 429 có Retry-After. Redis lỗi trả 503; health và CORS preflight không tính quota. Client không thể đổi quota bằng X-Forwarded-For. Khi đặt sau ingress, cần thiết kế trusted proxy riêng để tránh toàn bộ client chung một quota; không bật tin cậy forwarding headers đại trà.

`GATEWAY_CONNECT_TIMEOUT_MS` (3000), `GATEWAY_REQUEST_TIMEOUT_MS` (10000), `GATEWAY_MAX_BODY_BYTES` (1048576), `CORS_ORIGINS` (danh sách origin phân cách bằng dấu phẩy), `GATEWAY_PORT` (8080). Redis dùng REDIS_URL (mặc định redis://localhost:6379; có thể cấu hình credentials trong URL qua biến môi trường). URL service phải là HTTP(S) origin, không chứa path/query/credentials.

Gateway error mẫu:

```json
{"code":1104,"message":"Upstream service unavailable","result":null}
```

Gateway lỗi: 413 body quá lớn, 429 hết quota, 502 lỗi kết nối/response quá lớn, 503 Redis lỗi, 504 timeout. Lỗi HTTP 4xx/5xx từ downstream được chuẩn hóa thành code/message/result; HTTP status được giữ nguyên. Header Retry-After, WWW-Authenticate, Allow và Set-Cookie được bảo toàn. Nội dung lỗi gốc, SQL và exception không trả cho client. x-request-id nằm trong header. Response thành công giữ nguyên (bao gồm HTTP 200 với verified=false). Gateway chuyển tiếp thông tin xác thực; kiểm tra JWT/RBAC vẫn thuộc các service hiện có. Các cổng service cần được giới hạn trong mạng nội bộ khi triển khai.

Tests sử dụng HTTP server thật tại loopback và mock quota repository; không cần bật service nghiệp vụ hoặc Redis. Cần smoke test trên môi trường triển khai để xác nhận tích hợp Redis và các service thật.

## ErrorCode theo mẫu WebAppBusTicket

ErrorCode lưu mã ứng dụng, message và HTTP status. Service ném AppException(ErrorCode); GlobalExceptionHandler gọi ApiResponse.error(errorCode). Mã ứng dụng độc lập với HTTP status và không trùng nhau.

| Lỗi | HTTP | code |
|---|---|---|
| Exception ngoài dự kiến | 500 | 9999 |
| Chưa xác thực | 401 | 1001 |
| Validation | 400 | 1003 |
| Không có quyền | 403 | 1004 |
| Sai tham số | 400 | 1006 |
| Không tìm thấy | 404 | 1100 |
| Method không hỗ trợ | 405 | 1101 |
| Body quá lớn | 413 | 1102 |
| Rate limit | 429 | 1103 |
| Upstream không kết nối được | 502 | 1104 |
| Redis rate limiter lỗi | 503 | 1105 |
| Upstream timeout | 504 | 1106 |

Đây là thay đổi contract lỗi của gateway Spring: client đọc code/message thay cho statusCode/error. Service được gọi trực tiếp và gateway NestJS tiếp tục dùng contract riêng. ErrorCode.java chứa catalog đầy đủ và mapping HTTP status của downstream.
