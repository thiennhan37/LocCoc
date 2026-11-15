# OpenAPI các service và cách test bằng Bruno

Ngày đối chiếu mã nguồn: 2026-11-13, nhánh `chat-service`. Tất cả file dùng OpenAPI 3.0.3, import riêng theo service. Mỗi đặc tả ghi request body, query/path params, response, auth và các giới hạn của implementation hiện tại.

## Chọn file và URL

| Service | File để import | URL trực tiếp mặc định | Route chính |
| --- | --- | --- | --- |
| Auth | [openapi.yaml](../../auth-service/openapi.yaml) | `http://localhost:8000` | `/auth/*`; `/internal/*` chỉ nội bộ |
| User | [openapi.yaml](../../user-service/openapi.yaml) | `http://localhost:8081` | `/users/*` |
| AI | [openapi.yaml](../../ai-service/openapi.yaml) | `http://localhost:8082` | `/ai/images/enhance`, `/health` |
| Chat | [openapi.yaml](../../chat-service/openapi.yaml) | `http://localhost:8083` | `/chat/conversations/*`, `/health` |
| Notification | [openapi.yaml](../../notification-service/openapi.yaml) | `http://localhost:8084` | `/notifications`, `/notifications/*` |
| Payment | [openapi.yaml](../../payment-service/openapi.yaml) | `http://localhost:8085` | `/payments/*`, `/subscriptions/*`; health trực tiếp |
| Admin | [openapi.yaml](../../admin-service/openapi.yaml) | `http://localhost:8086` | `/admin/*` |
| Nest gateway | [openapi.yaml](../../api-gateway/openapi.yaml) | `http://localhost:8080` | Health và probe; proxy 8 prefix |
| Spring gateway | [openapi.yaml](../../api-gateway-spring/openapi.yaml) | `http://localhost:8080` | Health; proxy 5 prefix cũ |

Nest gateway proxy `/auth`, `/users`, `/ai`, `/chat`, `/notifications`, `/admin`, `/payments`, `/subscriptions`. Import file của service cần gọi rồi giữ nguyên path và đặt URL về `http://localhost:8080`. Không thêm `/api`. Riêng `/internal/*` và health riêng của service phải dùng URL trực tiếp.

Hai file gateway mô tả các operation do chính gateway sở hữu, kèm danh mục đặc tả downstream trong `x-service-openapi`. Muốn có request login/profile/payment trong Bruno, import thêm file tương ứng; metadata không tự nhập các file con.

Spring gateway chỉ proxy `/auth`, `/users`, `/admin`, `/payments`, `/subscriptions`. Hai gateway là phương án thay thế, cùng mặc định port 8080; đổi port nếu cần chạy đồng thời. Spring gateway chuẩn hóa lỗi thành `{code,message,result:null}` nên error body khác với gọi trực tiếp hoặc qua Nest gateway.

## Import vào Bruno

1. Mở **Import Collection** từ màn hình chính hoặc menu **+**; chọn **OpenAPI** và file YAML trong bảng.
2. Đặt tên collection theo service. Chọn cách nhóm **Tags** hoặc **Paths** rồi import. Đây là các cách import được mô tả trong [tài liệu Bruno chính thức](https://github.com/usebruno/bruno-docs/blob/main/v3/open-api/importOAS.mdx).
3. Kiểm tra URL thực tế của từng request sau import, nhất là operation có `servers` riêng như health và Auth Internal. Nếu dùng biến base URL, đặt theo cổng ở bảng; không dùng cùng một URL gateway cho các route chỉ có trực tiếp.
4. Với body JSON, điền dữ liệu thật thay placeholder, giữ `Content-Type: application/json`. Với AI, chọn file ảnh ở multipart theo [hướng dẫn AI](../../ai-service/README.md#import-vào-bruno).
5. Với API cần Bearer, dùng `accessToken` của lần login mới nhất. Nếu dùng biến Bruno, đặt token trong môi trường local rồi tham chiếu `{{accessToken}}` tại ô Bearer Token; không gõ thêm chữ `Bearer` trong ô này.

Giá trị `example`, UUID mẫu và schema không tạo sẵn tài khoản, session, bạn bè, thiết bị hay giao dịch. Token nội bộ/backend, credential PayOS/Gemini và refresh token thật chỉ giữ ở cấu hình local phù hợp; không lưu vào đặc tả/collection chia sẻ.

## Luồng Auth → User → Chat

1. Chạy hạ tầng, migration và Auth/User/Nest gateway như [hướng dẫn hai máy ảo](./chat-two-emulators.md#2-chuẩn-bị-backend-đăng-nhập-thật).
2. Trong collection Auth, gọi `POST /auth/register` với email/password riêng. Đăng ký trả **201**; policy password hiện yêu cầu 6–128 ký tự và chặn mật khẩu phổ biến/trùng email. Đổi password có DTO riêng yêu cầu mật khẩu mới tối thiểu **10** ký tự.
3. Dùng OTP mới thực sự được Auth cấp ở `POST /auth/verify-otp`; kiểm tra `verified: true`, không chỉ HTTP 200. Gọi `POST /auth/login` để nhận `accessToken` và `refreshToken`.
4. Đặt Bearer cho collection User. Gọi `GET /users/me`; sau đó `POST /users/me/username` để chọn username chưa dùng. Username chỉ được đặt một lần, từ 2–30 ký tự `[a-z0-9_]`, được trim/lowercase.
5. Tạo account thứ hai nếu test bạn bè/chat. Tìm bằng `GET /users/search?username=...`, gửi lời mời bằng `receiverId` account, rồi phía người nhận accept bằng **friend request ID**. Các route có `{id}` sẽ ghi rõ đó là account, request hay session ID.
6. Chạy Chat và dùng collection Chat để mở hội thoại/gửi tin; quy trình A/B, migration, retry và offline nằm trong [runbook](./chat-two-emulators.md).
7. Khi refresh, luôn thay cả hai token bằng cặp vừa trả về. Refresh token xoay một lần; logout, tự revoke session hoặc đổi password có thể làm token đang test mất hiệu lực.

Auth/User/Notification không có endpoint HTTP `/health` riêng trong phiên bản hiện tại. `GET /health` ở port 8080 chỉ xác nhận gateway, không xác nhận database hay các service đã sẵn sàng.

## Notification

Sau login, `GET /notifications` và `GET /notifications/counts` dùng Bearer thật. Giữ `pageInfo.nextCursor` cho trang tiếp theo; dùng đúng `seenCursor` từ trang đầu khi đánh dấu seen. Không tự tạo/sửa các cursor có chữ ký. Read và seen là hai trạng thái riêng, xem operation tương ứng.

Đăng ký thiết bị cần **FCM token của thiết bị thật**, platform và session hiện tại; FCM token khác access token. API inbox có thể test độc lập với việc giao push tới thiết bị. Không coi đăng ký device thành công là bằng chứng push đã đến.

## Admin và Payment: giới hạn cần biết

Hai Java service hiện không tự xác minh Bearer/JWT. Controller đang tin cậy các header như `X-User-Id`, `X-User-Role` và có giá trị mặc định ở một số route. Các operation ghi rõ header nào được dùng. URL trực tiếp chỉ nên dùng trong môi trường local tin cậy theo cấu hình đang có.

Nest gateway xác minh account/session cho route được bảo vệ, loại bỏ header danh tính do client gửi rồi gắn account ID/role đã xác minh. IAM hiện dùng UUID trong khi nhiều controller Java yêu cầu `Long`; các route đó có thể trả400 vì không chuyển được UUID sang số. Gửi một `X-User-Id` số từ Bruno qua Nest gateway không khắc phục được vì header sẽ bị thay. Đặc tả phản ánh giới hạn này, không coi đây là luồng đã tương thích hoàn toàn.

Gateway chưa áp dụng role-admin guard chung cho `/admin/*`; policy hiện tại khác nhau giữa các controller Java. Dùng đúng quyền và account test theo mô tả operation. Việc thống nhất IAM/RBAC giữa Java và Nest là thay đổi mã nguồn riêng.

`POST /payments/webhook/payos` là callback public qua Nest gateway, được Payment kiểm tra chữ ký của payload PayOS. Handler có thể trả HTTP 200 và success:true ngay cả khi chữ ký không hợp lệ; chỉ payload đã xác minh với code00 mới được xử lý nâng cấp. Không coi HTTP 200 là bằng chứng đã thanh toán. Không đặt token backend hoặc tự chế chữ ký. GET ping cùng path và POST `/payments/webhook/confirm` không có trong danh sách public của Nest gateway; gọi qua gateway cần Bearer. Tạo payment link, đăng ký webhook/confirm, thay tier, xóa account và thao tác quản trị thay đổi dữ liệu thật; chọn operation có chủ đích thay vì chạy toàn bộ collection.

## Phạm vi kiểm chứng

Các file được đối chiếu controller/DTO, service trả dữ liệu, guard và cấu hình hiện có; kiểm tra schema OpenAPI 3.0 chính thức, tham chiếu nội bộ, operation ID, path params và độ phủ route. Đây là tài liệu contract; lần bổ sung này chưa thao tác import trên giao diện Bruno hoặc chạy toàn bộ request với dịch vụ/payment/provider thật.

## Kiểm tra cấu hình local trước khi chạy

- Compose hiện cung cấp PostgreSQL, Redis và Kafka; chưa có MySQL. Admin/Payment mặc định cần MySQL tại `127.0.0.1:3307`, với database và user riêng. Khởi động Compose không đủ để hai Java service kết nối được database này. Payment còn cần credential PayOS thật trước khi kiểm tra thanh toán.
- Tên database trong file mẫu là giá trị mặc định. Volume PostgreSQL cũ có thể dùng tên khác, ví dụ `auth`/`user` thay vì `accounts`/`users`. Service phải dùng đúng database và credential đã tồn tại. Đổi password trong root env không đổi password role đang lưu trong volume.
- Các Nest service đọc env riêng; AI và hai Java service đọc root env theo loader hiện có. Khi sửa cấu hình, khởi động lại service để đọc giá trị mới. Dùng URL base nội bộ không có `/` cuối, ví dụ `AUTH_SERVICE_URL=http://127.0.0.1:8000`, vì một số client hiện nối trực tiếp với `/internal/...`.
- Notification cần role/database riêng và migration trong [hướng dẫn setup](../specs/notification/setup-and-learning.md). Nếu chỉ test inbox, đặt `FCM_ENABLED=false` trong env local; bật push khi `GOOGLE_APPLICATION_CREDENTIALS` trỏ tới file server credential hợp lệ. File mẫu hoặc một đường dẫn chưa tồn tại không đủ để khởi động FCM.
- Health200 của Gateway/AI/Chat xác nhận tiến trình tương ứng. Để kiểm tra luồng có auth, Auth phải chạy ở URL đã cấu hình; gateway có thể vẫn trả health200 trong khi route được bảo vệ trả503 vì Auth đã dừng. Khởi động thành công không xác nhận đã gửi ảnh Gemini, thanh toán PayOS hoặc giao push FCM thật.
