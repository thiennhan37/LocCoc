# AI Service và Bruno

Hợp đồng API: [openapi.yaml](./openapi.yaml) (OpenAPI 3.0.3), được đối chiếu với controller, DTO, validation, Gemini adapter, exception filter và gateway hiện có.

## API hiện có

| Method | Path | Kết quả |
| --- | --- | --- |
| GET | `/health` | JSON `{ "status": "ok" }`, chỉ kiểm tra tiến trình |
| POST | `/ai/images/enhance` | Ảnh nhị phân JPEG/PNG/WebP; sticker luôn là PNG trong suốt |

POST nhận multipart với đúng hai field: file `image` và text `filterId` (`handwritten_diary` hoặc `subject_sticker`). Đầu vào tối đa 10 MiB, đầu ra tối đa 20 MiB. API hiện chưa có JWT guard, endpoint liệt kê filter, upload riêng, lịch sử hoặc job polling.

## Chạy local

Từ root repository:

```sh
pnpm --filter @loccoc/common build
pnpm dev:ai
```

Service đọc `.env` ở root. Cần cung cấp `GEMINI_API_KEY` và `GEMINI_IMAGE_MODEL` bằng key/model thực tế của bạn. Không đưa key vào Bruno. Port mặc định là `8082`; có thể đặt `AI_SERVICE_PORT`.

Gateway đọc `AI_SERVICE_URL` (mặc định `http://127.0.0.1:8082`). Khi gọi qua gateway, cần chạy gateway và Redis cùng cấu hình gateway hiện có. [Compose](../compose.yaml) hiện chỉ chứa hạ tầng, không khởi động AI Service hay gateway.

| Biến | Mặc định / yêu cầu | Nơi áp dụng |
| --- | --- | --- |
| `GEMINI_API_KEY` | Bắt buộc, không để trống | AI Service |
| `GEMINI_IMAGE_MODEL` | Bắt buộc, không để trống | AI Service |
| `AI_SERVICE_PORT` | `8082` | AI Service |
| `AI_SERVICE_URL` | `http://127.0.0.1:8082` | Gateway |
| `AI_REQUEST_TIMEOUT_MS` | `60000`, số nguyên dương, tối đa `60000` | Pipeline xử lý AI |
| `AI_MAX_INPUT_BYTES` | `10485760`, tối đa `10485760` | Được validate cấu hình nhưng chưa dùng để giới hạn upload |
| `AI_MAX_OUTPUT_BYTES` | `20971520`, tối đa `20971520` | Được validate cấu hình nhưng chưa dùng để giới hạn output |
| `AI_RATE_LIMIT_MAX` | `5` | Limiter `/ai/*` ở gateway |
| `AI_RATE_LIMIT_WINDOW_MS` | `60000` | Limiter `/ai/*` ở gateway |

## Import vào Bruno

1. Mở chức năng **Import Collection**, chọn **OpenAPI** và chọn [openapi.yaml](./openapi.yaml).
2. Chọn server `http://localhost:8082` để gọi trực tiếp. Có thể dùng `http://localhost:8080` cho POST qua gateway. Nếu Bruno tạo biến base URL khi import, đặt biến đó tương ứng.
3. Với request POST, kiểm tra Body ở dạng **Multipart Form**: `image` là **File** (chọn ảnh trên máy), `filterId` là **Text** với giá trị `handwritten_diary` hoặc `subject_sticker`. Nếu bản Bruno đang dùng không tự tạo đủ field từ schema, thêm hai field này thủ công.
4. Để Bruno tự tạo header `Content-Type` kèm boundary khi gửi multipart. Đặt Auth là **No Auth** và timeout khoảng **90000 ms**.
5. Gửi request; response `200` là bytes ảnh. Xem preview hoặc lưu response ra file theo `Content-Type`. JSON chỉ dùng cho health check và lỗi.

Request `GET /health` cần trỏ trực tiếp tới `http://localhost:8082/health` (hoặc port AI đã cấu hình). `/health` trên port `8080` là health của gateway; `/ai/health` không tồn tại. Kiểm tra lại URL health nếu Bruno dùng chung biến base URL và bỏ qua server riêng của operation.

Ví dụ tương đương:

```sh
curl http://localhost:8082/health

curl --max-time 90 --fail-with-body \
  http://localhost:8082/ai/images/enhance \
  -F 'image=@/absolute/path/photo.jpg;type=image/jpeg' \
  -F 'filterId=handwritten_diary' \
  --output enhanced.jpg
```

Ảnh kết quả có thể khác định dạng ảnh đầu vào; chọn đuôi file theo `Content-Type` trả về. Với `subject_sticker`, lưu `.png`. Khi có lỗi, curl ở ví dụ trên ghi JSON lỗi vào file output và trả exit code khác 0.

## Kết quả rà soát mã nguồn

Các điểm cần lưu ý dưới đây mô tả implementation hiện tại; OpenAPI không giả định các hành vi chưa được triển khai.

| Mức độ | Phát hiện | Ảnh hưởng / hướng xử lý |
| --- | --- | --- |
| Trung bình | [Cấu hình](./src/config/ai-environment.ts) nhận `AI_MAX_INPUT_BYTES` và `AI_MAX_OUTPUT_BYTES`, nhưng [validator](./src/images/image-validation.service.ts), [controller](./src/images/image-enhancement.controller.ts) và [adapter](./src/images/gemini-image.adapter.ts) dùng hằng số 10/20 MiB. | Giảm hai biến này không giảm giới hạn thực tế. Nên dùng chung cấu hình trong cả ba lớp. |
| Trung bình | Timeout chỉ bắt đầu trong [ImageEnhancementService](./src/images/image-enhancement.service.ts), sau multipart parsing và DTO validation. | `AI_REQUEST_TIMEOUT_MS` không giới hạn thời gian upload; chưa đáp ứng deadline bao gồm upload trong [thiết kế UC-07](../docs/superpowers/specs/2026-10-05-uc-07-ai-image-enhancement-design.md). Cần timeout ở lớp nhận request/ingress nếu muốn giới hạn toàn request. |
| Thấp | [Middleware request ID](../libs/common/src/middleware/request-id.middleware.ts) luôn sinh UUID mới, trong khi [gateway](../api-gateway/src/service-proxy.controller.ts) chuyển tiếp ID của gateway tới upstream. | Service thay ID đó, làm log gateway và service không cùng ID. Response vẫn chứa ID service; nên thống nhất chính sách correlation ID. |
| Thấp | [Mẫu môi trường](../.env.example) hiện chưa liệt kê cấu hình AI. | Chỉ sao chép mẫu này chưa đủ chạy AI Service; phải bổ sung hai biến Gemini bắt buộc như hướng dẫn bên trên. |

Không có persistence ảnh trong luồng xử lý; request gửi Gemini với `store: false`, `stream: false` và `maxRetries: 0`. Log chuyên dụng chỉ ghi các trường vận hành. Đây là kết luận từ mã nguồn, không xác nhận hành vi lưu trữ phía nhà cung cấp.

## Kiểm tra

```sh
pnpm --filter ai-service test
pnpm --filter ai-service test:e2e
pnpm --filter ai-service build
pnpm --filter api-gateway test
pnpm --filter api-gateway test:e2e
```

Các test AI và test proxy gateway dùng Gemini/upstream mock, không cần gọi Gemini thật. Chúng kiểm tra input, ảnh trả về, lỗi HTTP, timeout, hủy request, multipart và rate limit. Kiểm tra bằng Gemini thật còn phụ thuộc key, model và quyền truy cập của tài khoản.

Kết quả kiểm tra ngày 2026-11-13:

| Kiểm tra | Kết quả |
| --- | --- |
| AI Service unit test | 60/60 pass |
| AI Service e2e test | 13/13 pass |
| AI Service build | Pass |
| Gateway unit test | 3/3 pass |
| Gateway e2e test | 9/9 pass |
| Gateway build | Pass |
| OpenAPI | Pass schema OpenAPI 3.0 chính thức (bản 2024-10-18), 31 tham chiếu nội bộ hợp lệ, 12 ví dụ lỗi khớp schema và tên HTTP status hiện tại |

Chưa thực hiện import bằng giao diện Bruno hoặc gọi Gemini thật trong lần rà soát này.
