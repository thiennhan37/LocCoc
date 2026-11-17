# Post service

Spring Boot, Java 21. Đăng ảnh qua `/posts/photos` bắt buộc JWT; ảnh lưu trong SeaweedFS/S3. API metadata `/posts` và xóa bài legacy vẫn chỉ dành cho phát triển.

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

## Đăng ảnh từ mobile vào SeaweedFS/S3

Home mới → Thêm tin / Gửi khoảnh khắc → chụp → chọn filter, thêm chữ → Gửi.
Mobile xuất PNG 1080×1080, rồi gọi POST /posts/photos qua gateway với `Authorization: Bearer <accessToken>`.
Backend kiểm tra JWT và trạng thái tài khoản/phiên qua `GET /users/me` của user-service. `ownerId` phải khớp danh tính đã xác thực (sai trả 403); thiếu/token hết hạn hoặc bị thu hồi trả 401. User-service không truy cập được trả 503. Mobile dùng UserApiClient để refresh một lần khi 401, giữ nguyên requestId/nội dung ảnh khi retry.

Body: requestId (UUID), ownerId (UUID), imageBase64 (PNG base64 thuần), caption (tối đa 200 ký tự).
PNG tối đa 5 MiB, chiều ảnh tối đa 2048 px; HTTP body tối đa 8 MiB.
Trả 201 với id và mediaKey=/posts/media/{id}; GET mediaKey trả image/png.
Retry phải giữ nguyên requestId và nội dung; cùng ID nhưng dữ liệu khác trả 409.

Ảnh mới lưu trong bucket **private** `loccoc-posts`, key `posts/{id}.png` bằng S3 API.
Database tiếp tục lưu `mediaKey=/posts/media/{id}`; API đọc ảnh và MobileApp không đổi URL.
Không ghi ảnh mới lên ổ đĩa local. Soft delete chỉ ngừng phục vụ ảnh, vẫn giữ object.
`POST_MEDIA_DIR` chỉ là nguồn đọc dự phòng khi `POST_LEGACY_READ_ENABLED=true` và S3 trả NoSuchKey; lỗi quyền/mạng không dùng fallback.
Endpoint /posts cũ vẫn dành cho metadata của media đã upload.
Chưa phân phối bài tới bạn bè.

Postman: gửi Bearer token khi gọi Publish photo; Read photo giữ nguyên URL.
Xóa biến photoRequestId trước khi tạo ảnh mới; giữ biến khi thử lại.

## Feed của mình và bạn bè

GET /posts/feed?limit=20&cursor=... và PUT /posts/{id}/seen yêu cầu Bearer token hợp lệ.
post-service gọi USER_SERVICE_URL (mặc định http://127.0.0.1:8081)/users/me/feed-audience; user-service xác thực tài khoản và lọc bạn bè accepted, active, không bị chặn.
Thứ tự: bài mình chưa xem trong 24h → bài bạn bè chưa xem → bài mình cũ chưa xem → tất cả bài đã xem. Trong từng nhóm, mới nhất trước.
POST_FEED_OWN_PRIORITY_HOURS cấu hình 1..8760 giờ, mặc định 24.
Response {data:[...],nextCursor:string|null}; limit 1..50; cursor sống 1 giờ, không đổi thứ tự khi đang cuộn.
Bảng post_views lưu lần xem đầu tiên theo viewer/post. DDL development update tự tạo khi khởi động; nếu dùng validate hãy áp dụng phần CREATE TABLE post_views trong schema-postgresql.sql.
Khởi động lại user-service và post-service sau khi cập nhật; cần auth-service đang chạy. Không dùng ownerId từ client để quyết định quyền đọc feed.

## Reactions trên bài đăng

`GET /posts/{id}/reactions`, `PUT /posts/{id}/reaction` với JSON `{"emoji":"💛"}` và
`DELETE /posts/{id}/reaction` đều trả `{"counts":{"💛":1},"myReaction":"💛"}`.
Chưa chọn hoặc đã xóa thì `myReaction` là `null`; counts chỉ chứa emoji có số lượng lớn hơn 0.
Cho phép 💛, 🔥, 😍, 😂, 👏. PUT thay thế lựa chọn cũ; PUT/DELETE có thể retry an toàn.
Mọi request cần Bearer JWT, xác minh viewer và audience hiện tại qua user-service; bài đã xóa,
không tồn tại hoặc không còn quyền xem trả 404. Không chấp nhận viewer/owner từ client làm danh tính.
Response dùng `Cache-Control: no-store`. Gateway `/posts/**` chuyển tiếp cả ba method.

Khởi động lại post-service để nạp API và tạo bảng `post_reactions` khi `ddl-auto=update`.
Nếu dùng `validate`, áp dụng riêng CREATE TABLE/INDEX `post_reactions` trong `schema-postgresql.sql`
trước khi restart. Không xóa hoặc di chuyển bảng `reactions` cũ, nội dung bài hay ảnh.
Khóa hàng bài đăng và unique `(viewer_id,post_id)` bảo đảm mỗi người chỉ có một reaction/bài.

## Thiết lập SeaweedFS local và giữ ảnh cũ

Cài Node dependencies bằng `corepack pnpm install --frozen-lockfile`.
Credentials local nằm trong `.env.post-media.local` ở root (đã được Git bỏ qua); không đưa file này vào commit.
Spring tự đọc file đó sau `.env`, khi chạy từ root hoặc post-service. Biến môi trường tiến trình vẫn có ưu tiên cao nhất.
File cần `MEDIA_S3_ACCESS_KEY`, `MEDIA_S3_SECRET_KEY`, `POST_S3_ENDPOINT=http://127.0.0.1:9000`, `POST_S3_BUCKET=loccoc-posts`, `POST_S3_REGION=us-east-1`, `POST_S3_PATH_STYLE=true`.

```powershell
# Chạy từ root; không cần bật PostgreSQL/Neo4j của compose chính.
docker compose -f compose.media.yaml --env-file .env.post-media.local --profile media up -d media-store

# Lần đầu: tạo bucket private, sao chép và kiểm chứng từng ảnh; không xóa file nguồn.
node scripts/migrate-post-media.mjs --source "C:/Users/<user>/Downloads/LocCoc/posts" --apply --create-bucket
# Kiểm tra lại: chỉ đọc, tất cả ảnh đã chuyển phải có trạng thái identical.
node scripts/migrate-post-media.mjs --source "C:/Users/<user>/Downloads/LocCoc/posts"
```

Standalone compose dùng cùng tên service `media-store` và volume `media_data` với compose chính khi dùng cùng project name.
Không chạy `docker compose down -v` nếu muốn giữ dữ liệu. Bucket của posts riêng với bucket public ảnh profile.
Công cụ chỉ đọc PNG có tên UUID, từ chối symlink, kiểm tra SHA-256 sau upload, không ghi đè object khác nội dung; lỗi trả exit code 1. Có thể chạy lại an toàn.
Trước khi chuyển xong có thể bật fallback và đặt đúng thư mục nguồn; sau khi tất cả ảnh được xác minh hãy đặt `POST_LEGACY_READ_ENABLED=false` và restart post-service.

## Chuyển sang AWS S3

Sao chép objects sang bucket private mới với cùng keys và kiểm chứng checksum trước khi đổi cấu hình.
Đặt `POST_S3_ENDPOINT=` (rỗng để SDK dùng AWS endpoint), region/bucket phù hợp, `POST_S3_PATH_STYLE=false`.
Xóa credentials SeaweedFS khỏi cấu hình đang được load hoặc đặt dedicated AWS credentials; ưu tiên IAM role/default credential chain trên AWS.
Cấp quyền GetObject/PutObject/DeleteObject giới hạn trong `posts/*`; bucket được provision riêng, ứng dụng không cần quyền tạo bucket.
Không cần đổi dữ liệu PostgreSQL hay bản mobile chỉ vì đổi nhà cung cấp storage.
SDK conditional writes và endpoint override theo [AWS PutObject](https://docs.aws.amazon.com/java/api/latest/software/amazon/awssdk/services/s3/model/PutObjectRequest.html) và [AWS endpoint configuration](https://docs.aws.amazon.com/sdk-for-java/latest/developer-guide/endpoint-config.html).

## Kiểm thử

`./mvnw.cmd test`: unit/API/auth/rollback; S3 integration tự skip nếu không có endpoint test.
Để kiểm thử S3 thật dùng kho test riêng, đặt `POST_S3_TEST_ENDPOINT`, `POST_S3_TEST_ACCESS_KEY`, `POST_S3_TEST_SECRET_KEY` rồi chạy `./mvnw.cmd -Dtest=S3PhotoIntegrationTests test`. Test tự tạo/xóa bucket tên ngẫu nhiên, không dùng bucket production.
`node --test scripts/post-media-migration.test.mjs` (từ root) kiểm tra migration.

Self-reactions are forbidden: PUT/DELETE on your own post return 403. GET remains available for received counts. Historical self-reactions are excluded from summaries without deleting stored rows. Inspect `public.post_reactions` in database `posts`; the legacy `reactions` table is not written by these endpoints.

Chat replies use authenticated `GET /posts/{id}/chat-reference`, returning `{postId, ownerId, mediaKey}` with Cache-Control: no-store. Only currently visible, undeleted peer posts with supported local media paths are returned. Own posts return 403; invisible/missing/deleted/unsupported posts return 404. chat-service forwards the sender JWT and checks ownerId against the conversation peer.

## AI preview before publishing (2026-11-17)

- Mobile composer: **Sửa ảnh bằng AI** -> select diary/sticker -> explicitly generate
  -> compare by holding -> **Dùng ảnh này** -> publish normally. Restore original
  remains available. Every explicit generation shows the stated 2,000 VND API cost.
- Authenticated `POST /posts/photos/enhance` takes requestId (UUID), imageBase64
  (PNG <=5 MiB, <=2048 px), filterId. Returns imageBase64 and mimeType, no post/S3 write.
- `AI_SERVICE_URL` configures the internal AI origin (default http://127.0.0.1:8082).
  Gemini credentials/model stay in ai-service; no new provider API is required.
- Apply the additive `ai_preview_attempts` table/index from schema-postgresql.sql
  when Hibernate schema update is disabled. Attempts persist before the provider
  call. Duplicate IDs return 409, including failed/uncertain attempts; new explicit
  generation uses a new ID and can incur another fee. No automatic retry.
- Preview deadlines: provider client 65s, either Gateway 75s, mobile 90s. The normal
  publish path retains its existing behavior. Five attempts/user/minute per instance;
  multi-instance quota coordination is not included. Ledger contains no images.
- Test with mocks only. A successful mock proves protocol/flow, not real Gemini
  compatibility or visual quality. Canceling a preview cannot undo provider billing.
- Contract and decision: docs/specs/post-ai-preview.md, docs/adr/ADR-020-post-ai-preview.md.
