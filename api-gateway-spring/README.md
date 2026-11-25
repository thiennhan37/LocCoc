# Spring MVC API Gateway

Java 21, Spring Boot 4.1.1, Redis. Gateway không dùng JPA hoặc database nghiệp vụ, đạt feature parity đầy đủ với `api-gateway` (NestJS).

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
| `/auth` | `AUTH_SERVICE_URL` | `http://127.0.0.1:8000` |
| `/users` | `USER_SERVICE_URL` | `http://127.0.0.1:8081` |
| `/notifications` | `NOTIFICATION_SERVICE_URL` | `http://127.0.0.1:8084` |
| `/posts`, `/moments` | `POST_SERVICE_URL` | `http://127.0.0.1:8089` |
| `/chat` | `CHAT_SERVICE_URL` | `http://127.0.0.1:8083` |
| `/ai` | `AI_SERVICE_URL` | `http://127.0.0.1:8087` |
| `/admin` | `ADMIN_SERVICE_URL` | `http://127.0.0.1:8086` |
| `/payments`, `/subscriptions` | `PAYMENT_SERVICE_URL` | `http://127.0.0.1:8085` |

## Các lớp & Tính năng bảo mật

- `controller`:
  - `GatewayController`: định tuyến toàn bộ 10 service prefix theo đúng thứ tự bảo vệ: Global IP Rate Limit -> Account Authority & Path Guard -> Route-specific Rate Limit -> Proxy.
  - `HealthController`: `/` và `/health` (liveness, miễn rate limit), `POST /health/echo` (rate limit 2 req/60s, kiểm tra strict payload), `GET /health/error` (kiểm tra ẩn stack trace).
- `service`:
  - `AccountAuthorityService`: chặn đường dẫn mập mờ/path traversal (`%`, `\`, `//`, `.`, `..` -> `404`), xác thực trạng thái tài khoản trực tiếp qua `GET ${AUTH_SERVICE_URL}/internal/access` kèm `INTERNAL_SERVICE_TOKEN` đối với các route cần bảo vệ, gắn header đã xác thực `x-user-id` & `x-user-role`. Các route public (`/posts/**`, `/ai/**`, `/health/**`, các endpoint `POST /auth/*` đăng nhập/đăng ký/social/logout và `POST /payments/webhook/payos`) được cho phép đi thẳng.
  - `ProxyService`:
    - Loại bỏ toàn bộ hop-by-hop headers (bao gồm `proxy-connection`, `expect`) và các header mạo danh từ client (`x-service-token`, `x-ai-actor`, `x-ai-metadata`, `x-user-id`, `x-user-role`, `x-user-roles`).
    - `/ai/**`: chặn tuyệt đối `/ai/internal/**` (`404`), đính kèm `x-service-token` tin cậy (`AI_SERVICE_TOKEN` >= 32 ký tự, fail-closed `503` nếu chưa cấu hình) cho `/ai/images/enhance`, giữ nguyên multipart boundary, stream trực tiếp ảnh nhị phân về client kèm `Cache-Control: no-store` và tự động đóng kết nối upstream khi client ngắt kết nối.
  - `RateLimitService`:
    - Global IP limit: `RATE_LIMIT_MAX` (`100`) / `RATE_LIMIT_TTL_MS` (`60000`).
    - AI IP limit: `AI_RATE_LIMIT_MAX` (`5`) / `AI_RATE_LIMIT_WINDOW_MS` (`60000`) kèm block duration nguyên tử trong Redis.
    - Moment search (`30/60s`), Media upload (`10/60s`), Health echo (`2/60s`).
- `repository`: `RedisRateLimitRepository` chạy Lua script nguyên tử hỗ trợ cả cửa sổ đếm (`PEXPIRE`) và khóa tạm thời (`blockDurationMs`).
- `configuration`: `GatewayProperties` kiểm tra chặt tất cả URL HTTP(S) origin, `CORS_ORIGINS` (cấm `*` hoặc đường dẫn con), `AI_SERVICE_TOKEN` và `INTERNAL_SERVICE_TOKEN`.
- `filter`: `RequestContextFilter` chuẩn hóa `x-request-id`, gắn security headers (`X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `X-Permitted-Cross-Domain-Policies`, `X-Download-Options`) và chặn sớm URI bất thường.
