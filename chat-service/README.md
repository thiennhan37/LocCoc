# Chat Service

Chat văn bản 1–1 giữa hai tài khoản thật đã là bạn bè. Tin nhắn lưu trong PostgreSQL riêng; REST gửi tin và Socket.IO phát cập nhật sau commit. Không có danh tính demo, chat nhóm, upload file/voice, push khi app đóng hoặc hỗ trợ nhiều replica trong bản này.

## Chạy

Từ root, tạo `chat-service/.env` từ [mẫu](./.env.example) nếu chưa có file. Điền `CHAT_DB_PASSWORD` và `INTERNAL_SERVICE_TOKEN` giống token nội bộ của Auth Service. Không gửi token nội bộ tới mobile. File môi trường luôn được đọc theo thư mục Chat Service, không phụ thuộc current working directory.

Database mặc định `chat`, role `chat_service`, PostgreSQL host `127.0.0.1:5433`. Với volume mới, Compose tạo database chat khi root environment có `CHAT_DB_PASSWORD`. Với volume có sẵn, chạy helper không xóa dữ liệu:

```sh
# Đặt password bằng giá trị giống trong chat-service/.env.
export CHAT_DB_PASSWORD='your-local-chat-db-password'
docker compose up -d db redis kafka
docker compose exec -T -e CHAT_DB_PASSWORD -e CHAT_DB_NAME=chat db sh -s \
  < docker/postgres/init-chat-database.sh
unset CHAT_DB_PASSWORD
```

Helper chỉ tạo role/database chưa tồn tại; không đổi password của role đã có. Nếu role đã tồn tại, dùng đúng credential hiện tại. Không chạy `down -v` để thêm database.

```sh
pnpm install --frozen-lockfile
pnpm db:migrate:chat
pnpm dev:chat
```

Migration chỉ apply phần pending, `synchronize: false`. Lệnh `dev:chat` watch TypeScript; `pnpm start:chat` build rồi chạy một lần. Chat cần Auth và User Service đang hoạt động để xác thực/kiểm tra quan hệ; REST public qua Nest gateway:

```sh
# Các terminal khác, tại root:
pnpm dev:auth
pnpm dev:user
pnpm dev:gateway
```

Gateway mặc định `CHAT_SERVICE_URL=http://127.0.0.1:8083`. Các URL nội bộ ở `chat-service/.env` phải trỏ đúng Auth/User. Health trực tiếp:

```sh
curl --fail http://127.0.0.1:8083/health
```

## Hợp đồng

Import [openapi.yaml](./openapi.yaml) vào Bruno, dùng Bearer `accessToken` thật cho tất cả `/chat/*`. Dùng gateway `http://localhost:8080` hoặc service trực tiếp `http://localhost:8083`; cả hai đều kiểm tra xác thực. Health của chat chỉ ở service trực tiếp.

| Method | Endpoint | Body / query |
| --- | --- | --- |
| POST | `/chat/conversations/direct` | `{ "peerId": "UUID của bạn bè" }` |
| GET | `/chat/conversations` | `limit` mặc định 20/max 50, `cursor` |
| GET | `/chat/conversations/:id` | Lấy detail và cả hai read cursor |
| GET | `/chat/conversations/:id/messages` | `limit` mặc định 25/max 100; `before` hoặc `after` |
| POST | `/chat/conversations/:id/messages` | `{ "clientMessageId": "UUID mới", "text": "Xin chào" }` |
| PATCH | `/chat/conversations/:id/read` | `{ "sequence": "1" }` |

Gửi/mở conversation trả 200 kể cả retry hợp lệ. Giữ nguyên clientMessageId và nội dung khi retry. UUID đã dùng với nội dung/conversation khác trả 409. Sequence luôn là chuỗi số, không phải số JavaScript. Tin nhắn 1–2000 Unicode code point sau trim; không nhận `senderId` từ client.

Sau block/unfriend, các thao tác và delivery mới bị chặn khi kiểm tra tiếp theo; participant vẫn được xem lịch sử, peer profile trả null và `canInteract: false`. Không hứa cập nhật UI tức thời khi màn hình idle.

## Socket

Socket kết nối trực tiếp origin port 8083, namespace `/chat`, Engine.IO path `/socket.io`, transport WebSocket. Handshake `auth: { accessToken: '<JWT thô, không kèm Bearer>' }`. Proxy HTTP `fetch` của gateway không hỗ trợ WebSocket upgrade.

Các event nhận: `message:new {message}`, `conversation:updated {conversationId}`, `typing:updated {conversationId,accountId,isTyping}`, `conversation:read {conversationId,accountId,sequence}`, `chat:error {code,message}`. Chỉ event gửi từ client là `typing:update {conversationId,isTyping}`; gửi tin qua REST. `chat:error`/connect_error.data dùng code số 400/401/403/429/503; nội dung lỗi dependency được lược bỏ.

Server xác minh session, participant và quan hệ trước từng event/delivery. Một account tối đa 5 socket; 1 typing update/giây/socket; typing tự hết hạn 3 giây; gửi tối đa 30 lần/phút/account. Bộ đếm RAM reset khi restart, không phải quota phân tán.

Socket có thể bỏ lỡ event. Database là nguồn lịch sử; reconnect/resume phải tải detail (read cursors) và tất cả các trang `messages?after=<sequence>`, hợp nhất theo message ID/clientMessageId. Không suy diễn “đã đọc” chỉ vì socket nhận tin. Tin đã commit vẫn phục hồi được nếu tiến trình dừng trước emit.

## Kiểm thử

```sh
pnpm --filter chat-service build
pnpm --filter chat-service test
pnpm --filter chat-service test:e2e
```

Socket integration dùng hai client thật trên server local. PostgreSQL/HTTP integration chỉ chạy khi có `CHAT_TEST_DB_URL`, dùng schema UUID riêng rồi dọn schema đó. Chỉ trỏ biến này vào database disposable mà bạn chủ động dành cho test, không dùng database dự án:

```sh
CHAT_TEST_DB_URL='postgres://postgres:test-only@127.0.0.1:55483/chat_test' \
  pnpm --filter chat-service test:e2e
```

[Hướng dẫn hai máy ảo](../docs/guides/chat-two-emulators.md) dùng hai Android AVD, có tùy chọn iOS sau khi sửa dependency nền và checklist gửi, offline, retry, read, logout. Realtime được kết nối khi đang ở luồng Tin nhắn; mở lại luồng này sẽ tải lịch sử nếu trước đó ở Home/đóng app.
