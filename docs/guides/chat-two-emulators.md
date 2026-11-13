# Chạy hai máy ảo để chuẩn bị và test chat LocCoc

Ngày: 2026-11-13. Nhánh: `chat-service`.

**Trạng thái:** đăng nhập/profile/bạn bè từ main đã được tích hợp. Mục 1–5 dùng các thành phần đang có. Mục 6 là checklist và cấu hình dự kiến cho chat, **chưa chạy được cho tới khi backend và màn hình chat được triển khai theo thiết kế được duyệt**. Không có command `dev:chat` hay biến Flutter `CHAT_SOCKET_URL` đang hoạt động ở thời điểm viết tài liệu.

## 1. Hai thiết bị độc lập

Trên máy macOS hiện tại đã phát hiện:

| Vai trò | Thiết bị | Định danh |
| --- | --- | --- |
| A | iPhone 17 Simulator | `72019E70-57C1-4A91-8125-3E5B1CE6B876` |
| B | Pixel 9 Android Emulator | AVD `Pixel_9_API_35`; device ID lấy sau khi khởi động |

Hai app cùng gọi một backend trên máy Mac. Không gọi trực tiếp IP của máy ảo còn lại. Mỗi app đăng nhập tài khoản khác nhau và có session/storage riêng.

```sh
flutter doctor
flutter emulators
flutter emulators --launch apple_ios_simulator
flutter emulators --launch Pixel_9_API_35
flutter devices
```

Chờ Android boot xong. Trong kết quả `flutter devices`, ghi lại ID Android, ví dụ `emulator-5554`; thay bằng ID thực tế ở các lệnh bên dưới. Nếu iPhone UUID đã đổi, dùng UUID mới. `apple_ios_simulator` là launcher, không phải device ID để truyền vào `flutter run -d`.

## 2. Chuẩn bị backend đăng nhập thật

Từ root repository, cài dependency:

```sh
pnpm install --frozen-lockfile
pnpm --filter @loccoc/common build
```

Kiểm tra các file môi trường riêng của [gateway](../../api-gateway/.env.example), [auth](../../auth-service/.env.example) và [user](../../user-service/.env.example). Chỉ copy mẫu khi file thật chưa tồn tại; không ghi đè cấu hình đang dùng. Gateway/Auth/User đọc file riêng; root `.env` dành cho Compose, không thay thế các file này.

Các điều kiện cần:

- PostgreSQL port host mặc định `5433`, Redis `6379`, Kafka `9092`.
- Tên database/role/password trong Compose và env service phải thống nhất: mặc định main dùng `accounts`/`auth_service`, `users`/`user_service`.
- Cùng `INTERNAL_SERVICE_TOKEN` ngẫu nhiên tối thiểu 32 ký tự cho gateway/auth/user. Không đưa token này vào Flutter, Bruno collection được chia sẻ hoặc Git.
- Auth có RSA private/public key; User có public key tương ứng, đường dẫn tương đối tính từ thư mục service. Giữ `JWT_ISSUER`, `JWT_AUDIENCE`, `JWT_KID` nhất quán.
- Notification/FCM không bắt buộc để thử đăng nhập, bạn bè và chat foreground; giữ `FCM_ENABLED` của Flutter là false khi chưa cấu hình push.

Nếu cần tạo key mới cho môi trường trống, theo [hướng dẫn JWT của repository](../../README.md#jwt-key-setup); không thay thế key đã có vì sẽ làm token cũ mất hiệu lực.

Khởi động các thành phần hạ tầng cần dùng:

```sh
docker compose up -d db redis kafka
docker compose ps
```

Chờ PostgreSQL/Redis healthy và Kafka sẵn sàng, rồi apply migration:

```sh
npm run db:migrate:auth
npm run db:migrate:user
```

Nếu volume cũ chưa có database/role mới, script init container không tự chạy lại. Khởi tạo phần còn thiếu bằng hướng dẫn database hiện có; không dùng `down -v` để sửa lỗi thiếu bảng/database.

Mở ba terminal riêng ở root và giữ chúng chạy:

```sh
# Terminal 1
pnpm dev:auth
```

```sh
# Terminal 2
pnpm dev:user
```

```sh
# Terminal 3 — dùng Nest gateway cho luồng này
pnpm dev:gateway
```

Kiểm tra:

```sh
curl --fail http://127.0.0.1:8080/health
```

Health gateway không xác nhận DB, Auth hay User đã sẵn sàng; thử login và API profile mới kiểm tra được cả luồng.

## 3. Tạo hai tài khoản thật A/B

Dùng Bruno hoặc REST client gọi qua `http://127.0.0.1:8080`:

1. `POST /auth/register` với `email` riêng và `password` đáp ứng chính sách backend. Đăng ký lần lượt A và B, ví dụ `chat.a@example.com`, `chat.b@example.com` nếu chưa dùng; đây không phải tài khoản đã được seed sẵn.
2. Trong development, lấy OTP được cấp mới từ console Auth Service, hoặc từ kênh gửi OTP đang cấu hình. Không dùng mã ví dụ `000000` như mã thật.
3. `POST /auth/verify-otp` với `{ "email": "...", "otp": "..." }` cho từng tài khoản.
4. Đăng nhập A trên iPhone và B trên Android bằng email/password thật. Không chọn session demo hoặc chia sẻ cùng một refresh token cho hai app.
5. Hoàn tất username/profile theo màn hình hiện có; chọn hai username khác nhau. A tìm B, gửi lời mời, B chấp nhận. Kiểm tra hai bên thấy nhau trong danh sách bạn bè.

Nếu Google Sign-In được dùng thay email/password, hoàn tất OAuth cho từng nền tảng và dùng hai Google account khác nhau. Không cần cấu hình Google/FCM để test bằng email/password.

## 4. Chạy app trên hai máy ảo

Trong hai terminal riêng, đều vào `MobileApp`. Chạy `flutter pub get` một lần trước khi mở hai phiên debug.

Terminal A — iPhone Simulator:

```sh
cd MobileApp
flutter pub get
flutter run -d 72019E70-57C1-4A91-8125-3E5B1CE6B876 \
  --dart-define=API_BASE_URL=http://127.0.0.1:8080
```

Terminal B — Android Emulator, thay ID thực tế:

```sh
cd MobileApp
flutter run -d emulator-5554 \
  --dart-define=API_BASE_URL=http://10.0.2.2:8080
```

Android Emulator có alias `10.0.2.2` trỏ về loopback của máy phát triển theo [tài liệu Android](https://developer.android.com/studio/run/emulator-networking-address). iOS Simulator trên Mac dùng URL loopback như cấu hình ở trên; xem [thiết lập Flutter iOS](https://docs.flutter.dev/platform-integration/ios/setup).

Có thể dùng `http://127.0.0.1:8080` cho Android nếu đã thiết lập ADB reverse (debug build hiện có tự thử forward port 8080). Nếu cần tự làm, dùng đúng SDK trên máy và ID Android:

```sh
"$HOME/Library/Android/sdk/platform-tools/adb" -s emulator-5554 reverse tcp:8080 tcp:8080
```

Sau khi đổi `--dart-define`, dừng và chạy lại app; hot reload không đổi build define. Nếu một terminal chờ startup lock của Flutter, chờ phiên build đầu kết thúc khởi tạo rồi chạy terminal thứ hai. Không dùng `flutter clean` khi hai phiên đang build.

## 5. Nếu muốn dùng hai Android emulator

Trong Android Studio → Device Manager, tạo AVD thứ hai với tên khác, rồi mở cả hai. Không mở lại cùng AVD đang dùng để thay cho thiết bị thứ hai.

```sh
flutter emulators
flutter emulators --launch Pixel_9_API_35
# Thay SECOND_AVD_ID bằng ID AVD thứ hai đã tạo:
flutter emulators --launch SECOND_AVD_ID
flutter devices
```

Mở hai terminal và chạy lần lượt bằng ID thực tế của từng thiết bị, ví dụ `-d emulator-5554`, `-d emulator-5556`, cùng `--dart-define=API_BASE_URL=http://10.0.2.2:8080`. Đăng nhập hai account khác nhau. Hai emulator không cần kết nối trực tiếp với nhau để chat qua server.

## 6. Checklist test chat — chờ triển khai

Theo [thiết kế đề xuất](../specs/chat/realtime-chat-design.md), Chat Service sẽ chạy port `8083`, REST qua gateway `/chat/*`, socket trực tiếp port 8083. Sau khi triển khai, hướng dẫn này phải được cập nhật với script chạy/migration thật và lệnh Flutter dùng `CHAT_SOCKET_URL` đã được code hỗ trợ.

| Máy | API_BASE_URL hiện có | CHAT_SOCKET_URL dự kiến |
| --- | --- | --- |
| iPhone Simulator | `http://127.0.0.1:8080` | `http://127.0.0.1:8083` |
| Android Emulator | `http://10.0.2.2:8080` | `http://10.0.2.2:8083` |

Nếu chọn loopback + ADB reverse cho Android, cần forward thêm port 8083; debug task hiện tại chỉ forward 8080. Socket namespace `/chat` và Engine.IO path `/socket.io` là hai khái niệm khác nhau; URL cấu hình là origin ở bảng này.

- [ ] A mở Tin nhắn → chọn bạn B → gửi “Xin chào B”. B nhận khi đang mở app, không kéo refresh.
- [ ] B trả lời, A nhận; emoji/tiếng Việt/nhiều dòng hiển thị đúng.
- [ ] Đang nhập chỉ hiện ở đúng hội thoại và tự tắt; chỉ báo đã đọc chỉ tăng khi B mở hội thoại.
- [ ] Gửi khi mất mạng giữ bản nháp/trạng thái chưa xác nhận; retry cùng ID không tạo tin đôi.
- [ ] B mất mạng trong lúc A gửi; B nối lại và nhận đúng các tin bị lỡ qua resync.
- [ ] Khởi động lại backend rồi mở lại hội thoại: lịch sử vẫn còn.
- [ ] Logout/chuyển tài khoản trên A không còn nhận nội dung của session cũ.
- [ ] Người thứ ba không thể đoán UUID để đọc/gửi vào hội thoại A/B.
- [ ] Block/unfriend làm mất quyền tương tác mới khi thao tác/resync hoặc trước khi nhận event mới; màn hình idle không hứa đổi ngay.

## 7. Chẩn đoán nhanh

| Hiện tượng | Kiểm tra |
| --- | --- |
| Android timeout, iPhone gọi được | URL `10.0.2.2` hoặc ADB reverse đúng ID; server/port và chính sách HTTP debug |
| Login trả 502/503 | Auth Service đang chạy; URL nội bộ và INTERNAL_SERVICE_TOKEN khớp |
| Login báo lỗi bảng không tồn tại | Đúng database/role và đã chạy migration Auth/User |
| Token 401 sau đổi key/đăng xuất | Đăng nhập lại thật; không tái sử dụng token cũ |
| Bạn bè không tìm thấy nhau | Account active, username đã hoàn tất, Kafka/account projection và lời mời đã được chấp nhận |
| Chat socket không nối được sau triển khai | URL riêng port 8083, token còn hạn, namespace/path; gateway HTTP hiện không proxy WebSocket |

Đến thời điểm viết tài liệu, đã chạy build và các test tự động của phần tích hợp main; chưa khởi động hai máy ảo để chạy một cuộc chat thật vì chat chưa được triển khai.
