# Thiết kế CSDL MySQL cho ứng dụng kiểu Locket

Tài liệu mô tả chi tiết từng bảng, từng thuộc tính và các index của phần MySQL.
Quan hệ bạn bè, lời mời kết bạn và chặn người dùng **không nằm ở MySQL** mà lưu ở Neo4j; hai CSDL liên kết với nhau qua `users.id`.

## Mục lục

1. [Quy ước chung](#1-quy-ước-chung)
2. [Sơ đồ quan hệ giữa các bảng](#2-sơ-đồ-quan-hệ-giữa-các-bảng)
3. [Chi tiết từng bảng](#3-chi-tiết-từng-bảng)
    - [users](#31-users)
    - [user_devices](#32-user_devices)
    - [moments](#33-moments)
    - [moment_recipients](#34-moment_recipients)
    - [reactions](#35-reactions)
    - [conversations](#36-conversations)
    - [messages](#37-messages)
    - [notifications](#38-notifications)
4. [Tổng hợp index](#4-tổng-hợp-index)
5. [Truy vấn mẫu và index được dùng](#5-truy-vấn-mẫu-và-index-được-dùng)
6. [Script tạo bảng đầy đủ](#6-script-tạo-bảng-đầy-đủ)
7. [Lưu ý khi triển khai](#7-lưu-ý-khi-triển-khai)

---

## 1. Quy ước chung

| Kiểu | Kiểu MySQL | Ý nghĩa |
|---|---|---|
| `binary16` | `BINARY(16)` | UUID lưu dạng 16 byte, nhỏ hơn chuỗi 36 ký tự nên index nhanh hơn. Khi trả về API hoặc sang Neo4j thì chuyển thành chuỗi UUID. |
| `datetime` | `DATETIME(3)` | Thời gian chính xác đến mili giây. Luôn lưu giờ **UTC**, chuyển sang giờ địa phương ở phía app. |
| `tinyint` | `TINYINT` | Số nguyên nhỏ, dùng cho trạng thái hoặc loại (enum). Ý nghĩa từng số do code quy định, ví dụ `enum UserStatus`. |
| `varchar` | `VARCHAR(n)` | Chuỗi có độ dài tối đa `n`. |
| `json` | `JSON` | Dữ liệu JSON, MySQL 5.7 trở lên. |

Ký hiệu khóa:

| Ký hiệu | Nghĩa |
|---|---|
| `PK` | Khóa chính (Primary Key) |
| `FK` | Khóa ngoại (Foreign Key) |
| `UK` | Ràng buộc duy nhất (Unique Key) |

Cấu hình chung: engine `InnoDB`, bảng mã `utf8mb4` (hỗ trợ emoji), collation `utf8mb4_0900_ai_ci` (MySQL 8) hoặc `utf8mb4_unicode_ci`.

---

## 2. Sơ đồ quan hệ giữa các bảng

```
users 1 ──< user_devices          (một người có nhiều thiết bị)
users 1 ──< notifications         (một người nhận nhiều thông báo)
users 1 ──< moments               (một người đăng nhiều ảnh)
moments 1 ──< moment_recipients >── 1 users   (ảnh được gửi tới nhiều người)
moments 1 ──< reactions >── 1 users           (nhiều người thả cảm xúc)
users 1 ──< conversations (user_low, user_high)
conversations 1 ──< messages
users 1 ──< messages (sender_id)
moments 0..1 ──< messages (moment_id, tin nhắn trả lời ảnh)
```

---

## 3. Chi tiết từng bảng

### 3.1 `users`

Lưu tài khoản người dùng.

| Cột | Kiểu | Khóa | Null | Ý nghĩa |
|---|---|---|---|---|
| `id` | `binary16` | PK | Không | Định danh duy nhất. Cũng là cầu nối sang node `User` trong Neo4j. |
| `username` | `varchar(30)` | UK | Không | Tên đăng nhập dạng `@username`, dùng để tìm kiếm và kết bạn. |
| `display_name` | `varchar(60)` | | Có | Tên hiển thị. Có thể trùng và đổi thoải mái. |
| `email` | `varchar(255)` | UK | Có | Email đăng nhập hoặc khôi phục mật khẩu. Null nếu đăng ký bằng số điện thoại (MySQL cho phép nhiều giá trị NULL trong cột UNIQUE). |
| `phone` | `varchar(20)` | UK | Có | Số điện thoại, nên chuẩn hóa dạng E.164 (`+84...`). Locket gốc đăng ký bằng số điện thoại. |
| `password_hash` | `varchar(255)` | | Có | Mật khẩu đã băm (bcrypt/argon2). Tuyệt đối không lưu mật khẩu gốc. Null nếu dùng đăng nhập Google/Apple. |
| `avatar_url` | `varchar(500)` | | Có | Đường dẫn ảnh đại diện. |
| `status` | `tinyint` | | Không | Trạng thái tài khoản: `1` hoạt động, `2` bị khóa, `3` đã xóa. Mặc định `1`. |
| `created_at` | `datetime` | | Không | Thời điểm tạo tài khoản. Mặc định thời gian hiện tại. |

**Index**

| Tên | Cột | Loại | Mục đích |
|---|---|---|---|
| `PRIMARY` | `id` | Clustered | Tra cứu theo id. |
| `uq_users_username` | `username` | Unique | Kiểm tra trùng khi đăng ký, tìm người theo username. |
| `uq_users_email` | `email` | Unique | Đăng nhập bằng email, kiểm tra trùng. |
| `uq_users_phone` | `phone` | Unique | Đăng nhập bằng số điện thoại, kiểm tra trùng. |

Không tạo index riêng cho `status` vì cột chỉ có vài giá trị (độ chọn lọc thấp), index không giúp ích.

---

### 3.2 `user_devices`

Một người có thể đăng nhập nhiều máy, nên cần bảng riêng để gửi push tới tất cả.

| Cột | Kiểu | Khóa | Null | Ý nghĩa |
|---|---|---|---|---|
| `id` | `binary16` | PK | Không | Định danh thiết bị. |
| `user_id` | `binary16` | FK → `users.id` | Không | Chủ sở hữu thiết bị. Xóa user thì xóa thiết bị (`ON DELETE CASCADE`). |
| `push_token` | `varchar(255)` | UK | Không | Token FCM (Android) hoặc APNs (iOS). Duy nhất vì một token chỉ thuộc một máy. |
| `platform` | `varchar(10)` | | Có | `ios` hoặc `android`, quyết định gửi qua APNs hay FCM. |
| `last_active_at` | `datetime` | | Có | Lần cuối thiết bị hoạt động. Dùng để dọn token cũ và tránh gửi push vào máy đã bỏ. |

**Index**

| Tên | Cột | Loại | Mục đích |
|---|---|---|---|
| `PRIMARY` | `id` | Clustered | Tra cứu theo id. |
| `uq_push_token` | `push_token` | Unique | Tránh một token gắn với nhiều dòng; khi người khác đăng nhập trên cùng máy thì cập nhật `user_id` thay vì tạo dòng mới. |
| `idx_dev_user` | `user_id` | Thường | Lấy tất cả thiết bị của một người để gửi push. Đồng thời là index cho khóa ngoại. |

---

### 3.3 `moments`

Lưu ảnh hoặc video ngắn đã đăng. Chỉ lưu metadata, file thật nằm trên S3/R2.

| Cột | Kiểu | Khóa | Null | Ý nghĩa |
|---|---|---|---|---|
| `id` | `binary16` | PK | Không | Định danh moment. |
| `owner_id` | `binary16` | FK → `users.id` | Không | Người đăng. |
| `media_key` | `varchar(500)` | | Không | Key của file gốc trên S3/R2. Chỉ lưu key, URL được tạo bằng signed URL khi cần. |
| `media_type` | `tinyint` | | Không | `0` = ảnh, `1` = video ngắn. Mặc định `0`. |
| `thumb_key` | `varchar(500)` | | Có | Key ảnh thu nhỏ, dùng cho widget và danh sách để tải nhanh. |
| `caption` | `varchar(200)` | | Có | Dòng chú thích ngắn. |
| `width` | `int` | | Có | Chiều rộng ảnh. App dùng để dựng khung trước khi tải xong, tránh giật layout. |
| `height` | `int` | | Có | Chiều cao ảnh. |
| `created_at` | `datetime` | | Không | Thời điểm đăng. |
| `deleted_at` | `datetime` | | Có | Thời điểm xóa mềm. Null nghĩa là còn hiển thị. Cho phép khôi phục và có thời gian để job dọn file trên S3. |

**Index**

| Tên | Cột | Loại | Mục đích |
|---|---|---|---|
| `PRIMARY` | `id` | Clustered | Tra cứu theo id. |
| `idx_moments_owner` | `owner_id, created_at DESC` | Thường | Xem lại các ảnh mình đã đăng, sắp xếp mới nhất trước, phân trang. Đồng thời là index cho khóa ngoại. |
| `idx_moments_deleted` | `deleted_at` | Thường (tùy chọn) | Job dọn dẹp quét các moment đã xóa mềm quá hạn để xóa file trên S3. Chỉ cần khi dữ liệu lớn. |

---

### 3.4 `moment_recipients`

Bảng quan trọng nhất cho feed, theo mô hình **fan-out on write**: mỗi lần đăng ảnh, thêm một dòng cho mỗi người bạn (danh sách bạn lấy từ Neo4j). Đây cũng là **cơ chế phân quyền xem ảnh**: chỉ ai có dòng ở đây mới được xem.

| Cột | Kiểu | Khóa | Null | Ý nghĩa |
|---|---|---|---|---|
| `moment_id` | `binary16` | PK, FK → `moments.id` | Không | Ảnh được chia sẻ. Xóa moment thì xóa các dòng này (`ON DELETE CASCADE`). |
| `recipient_id` | `binary16` | PK | Không | Người nhận (bạn bè tại thời điểm đăng). Tham chiếu logic tới `users.id`. |
| `created_at` | `datetime` | | Không | Sao chép từ `moments.created_at` để index feed mà không cần join. |
| `seen_at` | `datetime` | | Có | Lúc người nhận xem ảnh. Null nghĩa là chưa xem, dùng để hiện chấm "mới". |

Khóa chính kép `(moment_id, recipient_id)` đảm bảo mỗi người chỉ nhận một lần cho mỗi ảnh.

**Index**

| Tên | Cột | Loại | Mục đích |
|---|---|---|---|
| `PRIMARY` | `moment_id, recipient_id` | Clustered | Kiểm tra quyền xem một ảnh cụ thể; liệt kê người nhận của một ảnh (dùng tiền tố `moment_id`, đồng thời phục vụ khóa ngoại). |
| `idx_feed` | `recipient_id, created_at DESC` | Thường | **Lấy feed và ảnh mới nhất của một người** bằng một lần quét index, không cần sort thêm. |
| `idx_recipient_unseen` | `recipient_id, seen_at` | Thường (tùy chọn) | Đếm nhanh số ảnh chưa xem (`seen_at IS NULL`). Chỉ cần khi đếm thường xuyên. |

---

### 3.5 `reactions`

Cảm xúc emoji người dùng thả lên một ảnh.

| Cột | Kiểu | Khóa | Null | Ý nghĩa |
|---|---|---|---|---|
| `moment_id` | `binary16` | PK, FK → `moments.id` | Không | Ảnh được thả cảm xúc. Xóa moment thì xóa reaction. |
| `user_id` | `binary16` | PK | Không | Người thả. Tham chiếu logic tới `users.id`. |
| `emoji` | `varchar(16)` | | Không | Emoji đã chọn, lưu dạng chuỗi (emoji có thể chiếm nhiều byte). |
| `created_at` | `datetime` | | Không | Thời điểm thả. |

Khóa chính kép `(moment_id, user_id)` nghĩa là mỗi người chỉ có một reaction cho mỗi ảnh; đổi emoji thì ghi đè (`INSERT ... ON DUPLICATE KEY UPDATE`).

**Index**

| Tên | Cột | Loại | Mục đích |
|---|---|---|---|
| `PRIMARY` | `moment_id, user_id` | Clustered | Lấy tất cả reaction của một ảnh; kiểm tra một người đã thả chưa. Đồng thời phục vụ khóa ngoại `moment_id`. |

Chưa cần index riêng cho `user_id` vì app hiếm khi hỏi "người này đã thả những gì".

---

### 3.6 `conversations`

Cuộc trò chuyện 1-1 giữa hai người (trả lời ảnh sẽ tạo hoặc dùng lại cuộc trò chuyện này).

| Cột | Kiểu | Khóa | Null | Ý nghĩa |
|---|---|---|---|---|
| `id` | `binary16` | PK | Không | Định danh cuộc trò chuyện. |
| `user_low` | `binary16` | UK (cặp), FK → `users.id` | Không | Người có id **nhỏ hơn** trong cặp. |
| `user_high` | `binary16` | UK (cặp), FK → `users.id` | Không | Người có id **lớn hơn** trong cặp. |
| `last_message_at` | `datetime` | | Có | Thời điểm tin nhắn mới nhất. Dùng để sắp xếp danh sách chat mà không phải quét bảng `messages`. |

Ràng buộc `CHECK (user_low < user_high)` (enforce từ MySQL 8.0.16) và unique `(user_low, user_high)` đảm bảo cặp A-B và B-A chỉ ra **một** dòng. Khi tạo, code phải sắp xếp hai id trước khi insert.

**Index**

| Tên | Cột | Loại | Mục đích |
|---|---|---|---|
| `PRIMARY` | `id` | Clustered | Tra cứu theo id. |
| `uq_pair` | `user_low, user_high` | Unique | Tìm cuộc trò chuyện giữa hai người; chống tạo trùng. |
| `idx_conv_low` | `user_low, last_message_at DESC` | Thường | Danh sách chat của người nằm ở vị trí `user_low`, mới nhất trước. |
| `idx_conv_high` | `user_high, last_message_at DESC` | Thường | Danh sách chat của người nằm ở vị trí `user_high`. |

Khi lấy danh sách chat của một người, truy vấn hai nhánh `user_low = ?` và `user_high = ?` rồi `UNION ALL` và sắp xếp.

---

### 3.7 `messages`

| Cột | Kiểu | Khóa | Null | Ý nghĩa |
|---|---|---|---|---|
| `id` | `binary16` | PK | Không | Định danh tin nhắn. |
| `conversation_id` | `binary16` | FK → `conversations.id` | Không | Tin nhắn thuộc cuộc trò chuyện nào. Xóa cuộc trò chuyện thì xóa tin nhắn. |
| `sender_id` | `binary16` | FK → `users.id` | Không | Người gửi. Người nhận suy ra từ `conversations`. |
| `moment_id` | `binary16` | FK → `moments.id` | Có | Nếu là trả lời một ảnh thì trỏ tới ảnh đó, ngược lại null. Đây là điểm đặc trưng của Locket. |
| `type` | `tinyint` | | Không | Loại tin: `0` text, `1` ảnh, ... Mặc định `0`. |
| `content` | `text` | | Có | Nội dung văn bản. |
| `created_at` | `datetime` | | Không | Thời điểm gửi. |
| `read_at` | `datetime` | | Có | Lúc người nhận đọc. Null nghĩa là chưa đọc. |

**Index**

| Tên | Cột | Loại | Mục đích |
|---|---|---|---|
| `PRIMARY` | `id` | Clustered | Tra cứu theo id. |
| `idx_msg_conv` | `conversation_id, created_at DESC` | Thường | **Tải và phân trang lịch sử chat**, mới nhất trước. Đồng thời phục vụ khóa ngoại `conversation_id`. |
| `idx_msg_moment` | `moment_id` | Thường | Tìm các tin nhắn trả lời một ảnh. Cũng là index cho khóa ngoại; InnoDB sẽ tự tạo nếu bạn không khai báo. |
| `idx_msg_sender` | `sender_id` | Thường (tùy chọn) | Index cho khóa ngoại `sender_id`. InnoDB tự tạo nếu thiếu; chỉ khai báo tường minh để đặt tên. |

---

### 3.8 `notifications`

Thông báo hiển thị trong app (ngoài push).

| Cột | Kiểu | Khóa | Null | Ý nghĩa |
|---|---|---|---|---|
| `id` | `binary16` | PK | Không | Định danh thông báo. |
| `user_id` | `binary16` | FK → `users.id` | Không | Người nhận thông báo. |
| `type` | `varchar(30)` | | Không | Loại: `friend_request`, `new_moment`, `reaction`, ... Client dùng để chọn icon và màn hình đích. |
| `payload` | `json` | | Có | Dữ liệu kèm theo, ví dụ `{"moment_id": "...", "from_user": "..."}`. Mỗi loại có cấu trúc khác nhau nên dùng JSON thay vì thêm nhiều cột. |
| `is_read` | `tinyint(1)` | | Không | `0` chưa đọc, `1` đã đọc. Mặc định `0`. |
| `created_at` | `datetime` | | Không | Thời điểm tạo. |

**Index**

| Tên | Cột | Loại | Mục đích |
|---|---|---|---|
| `PRIMARY` | `id` | Clustered | Tra cứu theo id. |
| `idx_notif_user` | `user_id, created_at DESC` | Thường | Danh sách thông báo mới nhất của một người. Đồng thời phục vụ khóa ngoại. |
| `idx_notif_unread` | `user_id, is_read, created_at DESC` | Thường (tùy chọn) | Đếm và liệt kê thông báo chưa đọc. Nếu dùng index này thì có thể bỏ `idx_notif_user`. |

---

## 4. Tổng hợp index

| Bảng | Index | Cột | Loại | Bắt buộc |
|---|---|---|---|---|
| `users` | `PRIMARY` | `id` | PK | Có |
| `users` | `uq_users_username` | `username` | Unique | Có |
| `users` | `uq_users_email` | `email` | Unique | Có |
| `users` | `uq_users_phone` | `phone` | Unique | Có |
| `user_devices` | `PRIMARY` | `id` | PK | Có |
| `user_devices` | `uq_push_token` | `push_token` | Unique | Có |
| `user_devices` | `idx_dev_user` | `user_id` | Thường | Có |
| `moments` | `PRIMARY` | `id` | PK | Có |
| `moments` | `idx_moments_owner` | `owner_id, created_at DESC` | Thường | Có |
| `moments` | `idx_moments_deleted` | `deleted_at` | Thường | Tùy chọn |
| `moment_recipients` | `PRIMARY` | `moment_id, recipient_id` | PK kép | Có |
| `moment_recipients` | `idx_feed` | `recipient_id, created_at DESC` | Thường | **Có (quan trọng nhất)** |
| `moment_recipients` | `idx_recipient_unseen` | `recipient_id, seen_at` | Thường | Tùy chọn |
| `reactions` | `PRIMARY` | `moment_id, user_id` | PK kép | Có |
| `conversations` | `PRIMARY` | `id` | PK | Có |
| `conversations` | `uq_pair` | `user_low, user_high` | Unique | Có |
| `conversations` | `idx_conv_low` | `user_low, last_message_at DESC` | Thường | Có |
| `conversations` | `idx_conv_high` | `user_high, last_message_at DESC` | Thường | Có |
| `messages` | `PRIMARY` | `id` | PK | Có |
| `messages` | `idx_msg_conv` | `conversation_id, created_at DESC` | Thường | Có |
| `messages` | `idx_msg_moment` | `moment_id` | Thường | Nên có |
| `messages` | `idx_msg_sender` | `sender_id` | Thường | Tùy chọn |
| `notifications` | `PRIMARY` | `id` | PK | Có |
| `notifications` | `idx_notif_user` | `user_id, created_at DESC` | Thường | Có |
| `notifications` | `idx_notif_unread` | `user_id, is_read, created_at DESC` | Thường | Tùy chọn |

### Nguyên tắc đặt index trong thiết kế này

- **Index composite theo `(khóa lọc, thời gian DESC)`**: mọi truy vấn chính (feed, chat, thông báo, ảnh đã đăng) đều có dạng "lấy N dòng mới nhất của một đối tượng". Cột lọc đặt trước, cột sắp xếp đặt sau, nên MySQL đọc thẳng theo thứ tự index và dừng sau N dòng, không phải sort.
- **`DESC` trong index** chỉ thực sự có tác dụng từ MySQL 8.0. Ở bản cũ, MySQL vẫn chấp nhận cú pháp nhưng bỏ qua `DESC`; truy vấn `ORDER BY ... DESC` vẫn chạy được bằng cách đọc index ngược.
- **Index cho khóa ngoại**: InnoDB bắt buộc khóa ngoại phải có index, nếu thiếu sẽ tự tạo. Ở đây các index composite phía trên đã bao phủ hầu hết khóa ngoại nhờ quy tắc **tiền tố trái** (leftmost prefix).
- **Không đánh index thừa**: mỗi index làm chậm `INSERT/UPDATE` và tốn dung lượng. Bảng `moment_recipients` ghi rất nhiều (mỗi ảnh nhân với số bạn), nên chỉ giữ index thật sự cần.

---

## 5. Truy vấn mẫu và index được dùng

**Lấy feed của một người (30 ảnh mới nhất):**

```sql
SELECT m.id, m.owner_id, m.media_key, m.thumb_key, m.caption, m.created_at, mr.seen_at
FROM moment_recipients mr
JOIN moments m ON m.id = mr.moment_id
WHERE mr.recipient_id = :me
  AND m.deleted_at IS NULL
ORDER BY mr.created_at DESC
LIMIT 30;
```

Dùng `idx_feed (recipient_id, created_at DESC)`; join sang `moments` bằng khóa chính.

**Kiểm tra quyền xem một ảnh:**

```sql
SELECT 1 FROM moment_recipients
WHERE moment_id = :moment AND recipient_id = :me;
```

Dùng `PRIMARY (moment_id, recipient_id)`, tra cứu điểm.

**Đếm ảnh chưa xem:**

```sql
SELECT COUNT(*) FROM moment_recipients
WHERE recipient_id = :me AND seen_at IS NULL;
```

Dùng `idx_recipient_unseen (recipient_id, seen_at)` (nếu đã tạo).

**Lịch sử chat, phân trang theo thời gian:**

```sql
SELECT id, sender_id, moment_id, type, content, created_at, read_at
FROM messages
WHERE conversation_id = :conv
  AND created_at < :before
ORDER BY created_at DESC
LIMIT 50;
```

Dùng `idx_msg_conv (conversation_id, created_at DESC)`.

**Tìm cuộc trò chuyện giữa hai người:**

```sql
SELECT id FROM conversations
WHERE user_low = :low AND user_high = :high;   -- đã sắp xếp low < high
```

Dùng `uq_pair`.

**Danh sách chat của một người:**

```sql
(SELECT id, user_high AS other_user, last_message_at
   FROM conversations WHERE user_low = :me)
UNION ALL
(SELECT id, user_low  AS other_user, last_message_at
   FROM conversations WHERE user_high = :me)
ORDER BY last_message_at DESC
LIMIT 30;
```

Mỗi nhánh dùng `idx_conv_low` hoặc `idx_conv_high`.

**Số thông báo chưa đọc:**

```sql
SELECT COUNT(*) FROM notifications
WHERE user_id = :me AND is_read = 0;
```

Dùng `idx_notif_unread (user_id, is_read, created_at DESC)`.

> Luôn kiểm tra bằng `EXPLAIN` (hoặc `EXPLAIN ANALYZE` trên MySQL 8) để xác nhận cột `key` đúng là index mong muốn và không có `Using filesort` ở các truy vấn feed/chat.

---

## 6. Script tạo bảng đầy đủ

```sql
CREATE DATABASE IF NOT EXISTS locket
  CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
USE locket;

-- 1. users
CREATE TABLE users (
  id            BINARY(16)   NOT NULL,
  username      VARCHAR(30)  NOT NULL,
  display_name  VARCHAR(60)  NULL,
  email         VARCHAR(255) NULL,
  phone         VARCHAR(20)  NULL,
  password_hash VARCHAR(255) NULL,
  avatar_url    VARCHAR(500) NULL,
  status        TINYINT      NOT NULL DEFAULT 1,   -- 1 active, 2 banned, 3 deleted
  created_at    DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_username (username),
  UNIQUE KEY uq_users_email    (email),
  UNIQUE KEY uq_users_phone    (phone)
) ENGINE=InnoDB;

-- 2. user_devices
CREATE TABLE user_devices (
  id             BINARY(16)   NOT NULL,
  user_id        BINARY(16)   NOT NULL,
  push_token     VARCHAR(255) NOT NULL,
  platform       VARCHAR(10)  NULL,                -- ios / android
  last_active_at DATETIME(3)  NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_push_token (push_token),
  KEY idx_dev_user (user_id),
  CONSTRAINT fk_dev_user FOREIGN KEY (user_id)
    REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- 3. moments
CREATE TABLE moments (
  id          BINARY(16)   NOT NULL,
  owner_id    BINARY(16)   NOT NULL,
  media_key   VARCHAR(500) NOT NULL,
  media_type  TINYINT      NOT NULL DEFAULT 0,     -- 0 ảnh, 1 video
  thumb_key   VARCHAR(500) NULL,
  caption     VARCHAR(200) NULL,
  width       INT          NULL,
  height      INT          NULL,
  created_at  DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  deleted_at  DATETIME(3)  NULL,
  PRIMARY KEY (id),
  KEY idx_moments_owner   (owner_id, created_at DESC),
  KEY idx_moments_deleted (deleted_at),
  CONSTRAINT fk_moment_owner FOREIGN KEY (owner_id) REFERENCES users(id)
) ENGINE=InnoDB;

-- 4. moment_recipients
CREATE TABLE moment_recipients (
  moment_id    BINARY(16)  NOT NULL,
  recipient_id BINARY(16)  NOT NULL,
  created_at   DATETIME(3) NOT NULL,               -- copy từ moments.created_at
  seen_at      DATETIME(3) NULL,
  PRIMARY KEY (moment_id, recipient_id),
  KEY idx_feed            (recipient_id, created_at DESC),
  KEY idx_recipient_unseen (recipient_id, seen_at),
  CONSTRAINT fk_mr_moment FOREIGN KEY (moment_id)
    REFERENCES moments(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- 5. reactions
CREATE TABLE reactions (
  moment_id  BINARY(16)  NOT NULL,
  user_id    BINARY(16)  NOT NULL,
  emoji      VARCHAR(16) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (moment_id, user_id),
  CONSTRAINT fk_react_moment FOREIGN KEY (moment_id)
    REFERENCES moments(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- 6. conversations
CREATE TABLE conversations (
  id              BINARY(16)  NOT NULL,
  user_low        BINARY(16)  NOT NULL,
  user_high       BINARY(16)  NOT NULL,
  last_message_at DATETIME(3) NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_pair      (user_low, user_high),
  KEY idx_conv_low  (user_low,  last_message_at DESC),
  KEY idx_conv_high (user_high, last_message_at DESC),
  CONSTRAINT chk_conv_order CHECK (user_low < user_high),
  CONSTRAINT fk_conv_low  FOREIGN KEY (user_low)  REFERENCES users(id),
  CONSTRAINT fk_conv_high FOREIGN KEY (user_high) REFERENCES users(id)
) ENGINE=InnoDB;

-- 7. messages
CREATE TABLE messages (
  id              BINARY(16)  NOT NULL,
  conversation_id BINARY(16)  NOT NULL,
  sender_id       BINARY(16)  NOT NULL,
  moment_id       BINARY(16)  NULL,
  type            TINYINT     NOT NULL DEFAULT 0,  -- 0 text, 1 ảnh, ...
  content         TEXT        NULL,
  created_at      DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  read_at         DATETIME(3) NULL,
  PRIMARY KEY (id),
  KEY idx_msg_conv   (conversation_id, created_at DESC),
  KEY idx_msg_moment (moment_id),
  KEY idx_msg_sender (sender_id),
  CONSTRAINT fk_msg_conv   FOREIGN KEY (conversation_id)
    REFERENCES conversations(id) ON DELETE CASCADE,
  CONSTRAINT fk_msg_sender FOREIGN KEY (sender_id) REFERENCES users(id),
  CONSTRAINT fk_msg_moment FOREIGN KEY (moment_id) REFERENCES moments(id)
) ENGINE=InnoDB;

-- 8. notifications
CREATE TABLE notifications (
  id         BINARY(16)  NOT NULL,
  user_id    BINARY(16)  NOT NULL,
  type       VARCHAR(30) NOT NULL,
  payload    JSON        NULL,
  is_read    TINYINT(1)  NOT NULL DEFAULT 0,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_notif_user   (user_id, created_at DESC),
  KEY idx_notif_unread (user_id, is_read, created_at DESC),
  CONSTRAINT fk_notif_user FOREIGN KEY (user_id)
    REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;
```

---

## 7. Lưu ý khi triển khai

1. **Chọn kiểu khóa chính.** UUID v4 ngẫu nhiên làm clustered index của InnoDB bị phân mảnh (chèn vào giữa trang liên tục). Nên dùng **UUID v7** (có tiền tố thời gian, tăng dần) hoặc **Snowflake ID** (`BIGINT`) để chèn nhanh và index gọn hơn.
2. **`moment_recipients` và `reactions` không có khóa ngoại tới `users`.** Đây là cố ý: giảm chi phí kiểm tra khóa ngoại trên bảng ghi nhiều, và người nhận được lấy từ Neo4j nên tính đúng đắn do tầng ứng dụng đảm bảo. Nếu muốn ràng buộc chặt, thêm khóa ngoại `recipient_id → users(id)` và `user_id → users(id)`.
3. **Dọn dữ liệu quá hạn.** `moments` xóa mềm cần job định kỳ xóa file trên S3 rồi xóa hẳn dòng. Với bảng `moment_recipients` tăng rất nhanh, cân nhắc phân vùng (`PARTITION BY RANGE` theo `created_at`) hoặc xóa theo lô các dòng cũ để feed luôn nhanh.
4. **Đồng bộ với Neo4j.** Khi hủy kết bạn hoặc chặn, cần xóa hoặc ẩn các dòng `moment_recipients` tương ứng giữa hai người. Nên dùng cơ chế **transactional outbox** để đồng bộ MySQL sang Neo4j có retry và idempotent.
5. **Phiên bản MySQL.** Index `DESC` thực sự và `CHECK` constraint cần MySQL **8.0.16 trở lên**. Với MySQL 5.7, bỏ `DESC` trong định nghĩa index và kiểm tra `user_low < user_high` ở tầng ứng dụng.
6. **Kiểm tra bằng `EXPLAIN`** sau khi nạp dữ liệu thử, vì plan thực tế phụ thuộc vào thống kê và kích thước bảng.