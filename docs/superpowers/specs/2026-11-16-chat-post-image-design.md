# Tin nhắn phản hồi bài đăng kèm ảnh

Trạng thái: người dùng đã duyệt triển khai.

## Yêu cầu và hiện trạng
Người dùng yêu cầu gửi tin nhắn cho chủ bài qua chat-service và kèm ảnh bài đăng. Home đã gọi openDirect(ownerId); chat-service hiện chỉ hỗ trợ text. Tin nhắn, lịch sử và sự kiện realtime chưa có metadata ảnh.

## Phương án đề xuất
Lưu tham chiếu bài đăng và media ổn định cùng tin nhắn trong database riêng của chat-service. Dùng ảnh gốc SeaweedFS qua đường dẫn media của post-service; không lưu URL ký có hạn. Phương án tải lại một bản ảnh vào kho chat tạo dữ liệu trùng và thêm vòng đời lưu trữ, không cần cho yêu cầu hiện tại. Người dùng đã duyệt phương án này và yêu cầu triển khai.

## Hành vi
- Nhấn Gửi tin nhắn dưới bài người khác mở chat với đúng chủ bài, có preview ảnh trên ô soạn tin.
- Khi người dùng nhập chữ và nhấn gửi, gửi một tin nhắn chứa chữ và tham chiếu ảnh. Mở màn hình không tự gửi.
- Sau khi đưa tin nhắn vào hàng đợi gửi, bỏ ảnh khỏi ô soạn; các tin tiếp theo là chat thường. Tin lỗi giữ nguyên ảnh khi thử lại.
- Cả hai phía thấy ảnh trong bong bóng tin nhắn, kể cả sau khi mở lại lịch sử hoặc nhận qua realtime.
- Không tải được ảnh thì hiển thị thông báo ảnh không còn khả dụng; nội dung chữ vẫn đọc được. Không sao chép ảnh để giữ vĩnh viễn sau khi ảnh nguồn bị xóa.

## API, dữ liệu và bảo mật
- SendMessageDto nhận postId tùy chọn, không nhận URL ảnh tùy ý từ mobile.
- chat-service kiểm tra membership và chính sách bạn bè như hiện tại. Khi có postId, gọi post-service với JWT hiện hành để xác minh quyền xem, bài chưa xóa và ownerId trùng người nhận.
- post-service bổ sung API lấy tham chiếu bài có kiểm tra audience; route đi qua /posts hiện có trên gateway.
- Migration cộng thêm metadata postId/mediaKey vào messages; không sửa hoặc xóa tin nhắn cũ. Không truy vấn chéo database giữa các service.
- Kết quả gửi, lịch sử, lastMessage và message:new cùng mang metadata. Idempotency kiểm tra cả postId để không đổi ảnh khi dùng lại clientMessageId; retry cùng nội dung không tạo tin trùng.
- Mobile dựng URL ảnh từ origin gateway tin cậy; không nhận URL máy chủ tùy ý. JWT tiếp tục đi qua client hiện có.

## Kiểm chứng
Kiểm thử quyền xem, sai chủ bài, bài bị xóa, JWT, persistence và retry; kiểm thử mobile preview, payload, ảnh trong lịch sử/realtime, gửi lại khi lỗi, chat thường và không tự gửi khi mở. Chạy build/typecheck chat-service, test liên quan post-service, Flutter tests và analyze. Cập nhật OpenAPI, hướng dẫn migration và PROJECT_CONTEXT.
