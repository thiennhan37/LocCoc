# Post service

Spring Boot, Java 21. API đăng bài và xóa bài, chưa yêu cầu token.

## Chạy local

```powershell
cd D:\workspace\LocCoc\post-service
.\mvnw.cmd spring-boot:run
```

Mặc định port `8087`, kết nối trực tiếp vào PostgreSQL tại `jdbc:postgresql://127.0.0.1:5433/posts`. Test: `.\mvnw.cmd test`.

Đọc biến môi trường hoặc `.env` tại thư mục chạy/thư mục cha:

| Biến | Mặc định |
| --- | --- |
| POST_PORT | 8087 |
| POST_DB_URL | jdbc:postgresql://127.0.0.1:5433/posts |
| POST_DB_USER | postgres |
| POST_DB_PASSWORD | ${POSTGRES_ADMIN_PASSWORD:postgres} |
| POST_DB_DDL_AUTO | update (phát triển) |
| POST_SERVICE_URL | http://localhost:8087 (cấu hình gateway) |

PostgreSQL: dùng schema `schema-postgresql.sql` (đồng bộ với `Database/DatabaseStruct_PostgreSQL.sql` gồm `moments`, `moment_recipients`, `reactions`) trong database `posts` và đặt `POST_DB_DDL_AUTO=validate` khi triển khai production. Không chạy toàn bộ schema IAM dùng chung để tạo database này. Không commit mật khẩu.

## Đăng bài

`POST http://localhost:8087/posts` (hoặc `http://localhost:8080/posts` qua gateway).

```json
{
  "ownerId": "11111111-1111-4111-8111-111111111111",
  "mediaKey": "moments/photo.jpg",
  "mediaType": 0,
  "thumbKey": "moments/thumb.jpg",
  "caption": "Xin chào!",
  "width": 1080,
  "height": 1920
}
```

`ownerId`, `mediaKey`, `mediaType` bắt buộc. `mediaType`: 0 ảnh, 1 video. Chú thích tối đa 200 ký tự; khóa media tối đa 500; kích thước phải dương nếu được gửi. Media cần upload trước ở hệ thống lưu trữ; API này chỉ lưu metadata, chưa nhận file multipart/base64 và chưa gửi tới bạn bè.

Trả `201 Created`, header `Location: /posts/{id}`, body gồm các thông tin trên cùng `id`, `createdAt` (UTC). Sao chép `id` để xóa.

## Xóa bài

`DELETE http://localhost:8087/posts/{id}?ownerId=11111111-1111-4111-8111-111111111111`

Trả `204 No Content`; gọi lại vẫn 204. Bài không tồn tại hoặc ownerId khác trả 404. Thiếu trường, UUID sai hoặc dữ liệu không hợp lệ trả 400. Xóa mềm bằng `deleted_at`, không xóa object ảnh/video.

**Giới hạn xác thực:** client tự gửi ownerId nên có thể giả mạo. Chỉ dùng cơ chế này để phát triển; khi auth hoàn thành, lấy ownerId từ principal đã xác thực cho cả đăng và xóa trước khi công khai API.
Lỗi trả cùng chuẩn api-gateway-spring: {"code":1100,"message":"Requested resource not found","result":null}. Validation: 1003; tham số/JSON sai: 1006; lỗi nội bộ: 9999. HTTP status vẫn giữ 400/404/500 tương ứng.


## Postman

Import `postman/loccoc-api-gateway.postman_collection.json`, mở folder **Post Service**.
`postServiceUrl` mặc định `http://localhost:8087`; đổi sang `http://localhost:8080` khi chạy gateway.
Chạy **Create Post** trước: response 201 tự lưu `postId` vào collection variables.
Sau đó **Delete Post** sử dụng `postId` và `postOwnerId`, trả 204.
Không cần Bearer token. `mediaKey` là khóa media đã upload, không phải file ảnh đính kèm.

Kiểm tra local 2026-11-12: POST trả 201, bản ghi được xác nhận trong PostgreSQL posts.moments;
DELETE trả 204 và deleted_at được cập nhật. Service đọc mật khẩu từ môi trường/.env.

## Đăng ảnh local từ mobile

Home mới → Thêm tin / Gửi khoảnh khắc → chụp → chọn filter, thêm chữ → Gửi.
Mobile xuất PNG 1080×1080, rồi gọi POST /posts/photos qua gateway.

Body: requestId (UUID), ownerId (UUID), imageBase64 (PNG base64 thuần), caption (tối đa 200 ký tự).
PNG tối đa 5 MiB, chiều ảnh tối đa 2048 px; HTTP body tối đa 8 MiB.
Trả 201 với id và mediaKey=/posts/media/{id}; GET mediaKey trả image/png.
Retry phải giữ nguyên requestId và nội dung; cùng ID nhưng dữ liệu khác trả 409.

Ảnh mặc định: \Users\<user>\Downloads\LocCoc\posts\{id}.png trên máy chạy Java.
Trên máy hiện tại: C:/Users/tahpn/Downloads/LocCoc/posts.
Có thể đổi bằng biến POST_MEDIA_DIR (đường dẫn tuyệt đối). Metadata ở PostgreSQL posts.moments.
Xóa bài là xóa mềm; API ngừng phục vụ ảnh nhưng file vẫn giữ ở local.
Endpoint /posts cũ vẫn dành cho metadata của media đã upload.
Chưa phân phối bài tới bạn bè.

Postman: Publish local photo, Read local photo đã có trong cả hai collection.
Xóa biến photoRequestId trước khi tạo ảnh mới; giữ biến khi thử lại.
