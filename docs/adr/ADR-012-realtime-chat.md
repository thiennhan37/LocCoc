# ADR-012: Chat 1–1 dùng danh tính IAM hiện có

Ngày: 2026-11-13. Trạng thái: **Proposed**, chờ duyệt [thiết kế](../specs/chat/realtime-chat-design.md).

## Bối cảnh

Người dùng chọn tích hợp đăng nhập thật từ `main` vào local `chat-service`, cần chat realtime và màn hình Flutter để thử giữa hai máy ảo. Chat cần account/session thật, dữ liệu bền vững và quyền thành viên hội thoại; không thể coi một socket kết nối thành công là bằng chứng đã đăng nhập.

## Quyết định đề xuất

- NestJS Chat Service, port 8083, PostgreSQL/database-per-service.
- Tái sử dụng authority của Auth Service và API quan hệ bạn bè từ User Service.
- REST qua Nest gateway cho lịch sử và tất cả các thao tác bền vững; Socket.IO trực tiếp service cho cập nhật realtime trong môi trường local. Không bổ sung WebSocket proxy bằng cách giả định proxy `fetch` hiện tại hỗ trợ upgrade.
- Một đường ghi message qua REST, idempotency do `(sender_id, client_message_id)` bảo đảm. Phát event sau commit, REST resync khi reconnect.
- Một instance trong giai đoạn này; không áp dụng giả định room giữa nhiều instance trước khi có adapter/broker.

## Các hướng cân nhắc

MVP danh tính test local đã không được chọn. Polling-only không đáp ứng mục tiêu realtime. WebSocket thuần có thể làm được nhưng phải tự quy định reconnect/event framing; Socket.IO được đề xuất vì có sẵn cơ chế kết nối lại và mô hình event cùng client Dart.

## Hệ quả

Chat phụ thuộc Auth/User availability và cần session lifecycle ở cả HTTP lẫn socket. UI phải xử lý duplicate, event bị bỏ lỡ và session switch. Socket không phải nguồn lịch sử; guarantee mặc định của transport không thay thế persistence hay idempotency. Push khi app đóng, file/voice, chat nhóm và scale nhiều replica sẽ là các thay đổi thiết kế riêng.
