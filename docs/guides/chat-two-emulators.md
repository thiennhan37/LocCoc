# Chạy hai máy ảo để chuẩn bị và test chat LocCoc

Ngày: 2026-11-13. Nhánh: `chat-service`.

**Trạng thái:** đăng nhập/profile/bạn bè từ main và Chat Service đã được tích hợp theo thiết kế được duyệt. Các lệnh `dev:chat`, `db:migrate:chat` và cấu hình Flutter `CHAT_SOCKET_URL` được dùng trong quy trình dưới đây. Chat realtime hoạt động khi app đang mở; chưa có push tin nhắn khi app đóng.

## 1. Hai thiết bị độc lập

**Khuyến nghị hiện tại: hai Android AVD khác nhau theo mục 4.** Native build iOS của nền main đang gặp conflict dependency giữa `firebase_messaging 17.0.1` (Firebase iOS/AppCheck mới) và `google_sign_in_ios 6.3.8` (GoogleSignIn/AppCheck cũ). Đây là phần cần xử lý riêng trong nền đăng nhập/push trước khi dùng nhánh iPhone ở mục 4; `flutter analyze/test` không phát hiện được lỗi native dependency này. Không đổi phiên bản auth/push chỉ để chạy chat.

Trên máy macOS hiện tại đã phát hiện Pixel 9 AVD `Pixel_9_API_35`. Tạo thêm một AVD tên khác trong Android Studio → Device Manager, ví dụ `Pixel_8_API_35`. Không mở lại cùng AVD đang dùng để thay cho thiết bị thứ hai.

| Vai trò | Thiết bị | Định danh |
| --- | --- | --- |
| A | Pixel 9 Android Emulator | AVD `Pixel_9_API_35`; device ID lấy sau khi khởi động |
| B | Android Emulator thứ hai | AVD riêng do bạn tạo; device ID lấy sau khi khởi động |

Hai app cùng gọi một backend trên máy Mac. Không gọi trực tiếp IP của máy ảo còn lại. Mỗi app đăng nhập tài khoản khác nhau và có session/storage riêng.

```sh
flutter doctor
flutter emulators
flutter emulators --launch Pixel_9_API_35
flutter emulators --launch Pixel_8
flutter devices
```

Chờ cả hai Android boot xong. Trong kết quả `flutter devices`, ghi lại hai ID khác nhau, ví dụ `emulator-5554` và `emulator-5556`; thay bằng ID thực tế ở các lệnh bên dưới.

## 2. Chuẩn bị backend đăng nhập thật

Từ root repository, cài dependency:

```sh
pnpm install --frozen-lockfile
pnpm --filter @loccoc/common build
```

Kiểm tra các file môi trường riêng của [gateway](../../api-gateway/.env.example), [auth](../../auth-service/.env.example), [user](../../user-service/.env.example) và [chat](../../chat-service/.env.example). Chỉ copy mẫu khi file thật chưa tồn tại; không ghi đè cấu hình đang dùng. Mỗi service đọc file riêng; root `.env` dành cho Compose, không thay thế các file này.

Các điều kiện cần:

- PostgreSQL port host mặc định `5433`, Redis `6379`, Kafka `9092`.
- Tên database/role/password trong Compose và env service phải thống nhất: mặc định main dùng `accounts`/`auth_service`, `users`/`user_service`.
- Cùng `INTERNAL_SERVICE_TOKEN` ngẫu nhiên tối thiểu 32 ký tự cho gateway/auth/user/chat. Không đưa token này vào Flutter, Bruno collection được chia sẻ hoặc Git.
- Chat có database riêng `chat`, role `chat_service`; `CHAT_DB_PASSWORD` trong `chat-service/.env` phải khớp password role. Gateway mặc định `CHAT_SERVICE_URL=http://127.0.0.1:8083`; Chat gọi Auth `8000` và User `8081`.
- Auth có RSA private/public key; User có public key tương ứng, đường dẫn tương đối tính từ thư mục service. Giữ `JWT_ISSUER`, `JWT_AUDIENCE`, `JWT_KID` nhất quán.
- Notification/FCM không bắt buộc để thử đăng nhập, bạn bè và chat foreground; giữ `FCM_ENABLED` của Flutter là false khi chưa cấu hình push.

Nếu cần tạo key mới cho môi trường trống, theo [hướng dẫn JWT của repository](../../README.md#jwt-key-setup); không thay thế key đã có vì sẽ làm token cũ mất hiệu lực.

Khởi động các thành phần hạ tầng cần dùng:

```sh
docker compose up -d db redis kafka
docker compose ps
```

Chờ PostgreSQL/Redis healthy và Kafka sẵn sàng. Tạo database chat nếu volume đã có từ trước (helper không xóa/đổi dữ liệu hay password role hiện có):

```sh
# Giá trị phải giống CHAT_DB_PASSWORD trong chat-service/.env, không dùng ví dụ này làm secret thật.
export CHAT_DB_PASSWORD='your-local-chat-db-password'
docker compose exec -T -e CHAT_DB_PASSWORD -e CHAT_DB_NAME=chat db sh -s \
  < docker/postgres/init-chat-database.sh
unset CHAT_DB_PASSWORD
```

Sau đó apply các migration:

```sh
npm run db:migrate:auth
npm run db:migrate:user
pnpm db:migrate:chat
```

Nếu volume cũ chưa có database/role mới, script init container không tự chạy lại. Khởi tạo phần còn thiếu bằng hướng dẫn database hiện có; không dùng `down -v` để sửa lỗi thiếu bảng/database.

Mở bốn terminal riêng ở root và giữ chúng chạy:

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

```sh
# Terminal 4
pnpm dev:chat
```

Kiểm tra:

```sh
curl --fail http://127.0.0.1:8080/health
curl --fail http://127.0.0.1:8083/health
```

Health gateway không xác nhận DB, Auth hay User đã sẵn sàng; thử login và API profile mới kiểm tra được cả luồng.

## 3. Tạo hai tài khoản thật A/B

Dùng Bruno hoặc REST client gọi qua `http://127.0.0.1:8080`:

1. `POST /auth/register` với `email` riêng và `password` đáp ứng chính sách backend. Đăng ký lần lượt A và B, ví dụ `chat.a@example.com`, `chat.b@example.com` nếu chưa dùng; đây không phải tài khoản đã được seed sẵn.
2. Trong development, lấy OTP được cấp mới từ console Auth Service, hoặc từ kênh gửi OTP đang cấu hình. Không dùng mã ví dụ `000000` như mã thật.
3. `POST /auth/verify-otp` với `{ "email": "...", "otp": "..." }` cho từng tài khoản.
4. Đăng nhập A trên máy ảo thứ nhất và B trên máy ảo thứ hai bằng email/password thật. Không chọn session demo hoặc chia sẻ cùng một refresh token cho hai app.
5. Hoàn tất username/profile theo màn hình hiện có; chọn hai username khác nhau. A tìm B, gửi lời mời, B chấp nhận. Kiểm tra hai bên thấy nhau trong danh sách bạn bè.

Nếu Google Sign-In được dùng thay email/password, hoàn tất OAuth cho từng nền tảng và dùng hai Google account khác nhau. Không cần cấu hình Google/FCM để test bằng email/password.

## 4. Chạy app trên hai máy ảo

Build **một lần**, chờ hoàn tất rồi cài cùng APK vào hai máy ảo. Hai lượt `flutter run` build đồng thời từ cùng thư mục có thể ghi/xóa chung asset output và gây lỗi `copyFlutterAssetsDebug` / thiếu `FontManifest.json`. Hai emulator vẫn giữ dữ liệu và phiên đăng nhập riêng khi dùng cùng APK.

Chạy từng bước trong một terminal, từ root repository:

```sh
cd MobileApp
flutter pub get
flutter build apk --debug \
  --dart-define=API_BASE_URL=http://10.0.2.2:8080 \
  --dart-define=CHAT_SOCKET_URL=http://10.0.2.2:8083
```

Sau khi build thành công, cài và mở app trên cả hai emulator. Thay ID bằng kết quả thực tế từ `flutter devices`; đường dẫn ADB dưới đây dành cho Android SDK mặc định trên macOS:

```sh
chat_adb="$HOME/Library/Android/sdk/platform-tools/adb"
"$chat_adb" -s emulator-5554 install -r build/app/outputs/flutter-apk/app-debug.apk
"$chat_adb" -s emulator-5556 install -r build/app/outputs/flutter-apk/app-debug.apk
"$chat_adb" -s emulator-5554 shell am start -n com.example.mobile_app/.MainActivity
"$chat_adb" -s emulator-5556 shell am start -n com.example.mobile_app/.MainActivity
```

`install -r` cập nhật app và giữ dữ liệu đang có. Mỗi emulator đăng nhập một account riêng. Khi đổi code hoặc build define, build lại một lượt rồi cập nhật APK trên hai máy; quy trình này dùng để test A/B bằng app đã build.

Nếu cần dùng `flutter run` để debug, khởi động từng phiên lần lượt: đợi phiên đầu build/cài xong và app đã mở, rồi mới chạy phiên thứ hai. Không bắt đầu hai lượt Gradle build cùng lúc trong cùng checkout.

Android Emulator có alias `10.0.2.2` trỏ về loopback của máy phát triển theo [tài liệu Android](https://developer.android.com/studio/run/emulator-networking-address). iOS Simulator trên Mac dùng URL loopback như cấu hình ở trên; xem [thiết lập Flutter iOS](https://docs.flutter.dev/platform-integration/ios/setup).

Có thể dùng `http://127.0.0.1:8080` cho Android nếu đã thiết lập ADB reverse (debug build hiện có tự thử forward port 8080). Nếu cần tự làm, dùng đúng SDK trên máy và ID Android:

```sh
"$HOME/Library/Android/sdk/platform-tools/adb" -s emulator-5554 reverse tcp:8080 tcp:8080
"$HOME/Library/Android/sdk/platform-tools/adb" -s emulator-5554 reverse tcp:8083 tcp:8083
```

Nếu dùng ADB reverse, đặt cả hai define về loopback `127.0.0.1` với port tương ứng. Đừng dùng loopback cho socket Android khi chỉ forward mỗi port 8080.

Sau khi đổi `--dart-define`, build và cài lại APK; hot reload không đổi build define. Startup lock của Flutter không bảo đảm mọi output Gradle được tách riêng. Chờ build trước kết thúc hoàn toàn; không chạy `flutter clean` hoặc xóa cache khi còn lượt build đang chạy.

## 5. Tùy chọn iPhone Simulator sau khi sửa dependency nền

iPhone 17 Simulator từng được phát hiện với UUID `72019E70-57C1-4A91-8125-3E5B1CE6B876`. Nhánh này chưa build iOS thành công do conflict Firebase/Google Sign-In nêu ở mục 1. Sau khi dependency nền đã được xử lý, có thể thay một Android bằng iPhone:

```sh
flutter emulators --launch apple_ios_simulator
flutter devices
cd MobileApp
flutter run -d 72019E70-57C1-4A91-8125-3E5B1CE6B876 \
  --dart-define=API_BASE_URL=http://127.0.0.1:8080 \
  --dart-define=CHAT_SOCKET_URL=http://127.0.0.1:8083
```

Thay UUID bằng ID thực tế từ `flutter devices` nếu đã đổi. `apple_ios_simulator` là launcher, không phải ID để truyền vào `flutter run -d`. Dùng tài khoản riêng trên mỗi app; cả hai vẫn gọi cùng backend.

## 6. Test chat

Theo [thiết kế đã duyệt](../specs/chat/realtime-chat-design.md), Chat Service chạy port `8083`, REST qua gateway `/chat/*`, socket trực tiếp port 8083. Hai tài khoản phải là bạn bè. Tại Home, mở **Tin nhắn**, chọn nút tạo hội thoại rồi chọn người bạn còn lại. Có thể dùng [OpenAPI chat](../../chat-service/openapi.yaml) để kiểm tra REST riêng bằng Bruno với Bearer token thật.

| Máy | API_BASE_URL | CHAT_SOCKET_URL |
| --- | --- | --- |
| iPhone Simulator | `http://127.0.0.1:8080` | `http://127.0.0.1:8083` |
| Android Emulator | `http://10.0.2.2:8080` | `http://10.0.2.2:8083` |

Nếu chọn loopback + ADB reverse cho Android, cần forward thêm port 8083; debug task hiện tại chỉ forward 8080. Socket namespace `/chat` và Engine.IO path `/socket.io` là hai khái niệm khác nhau; URL cấu hình là origin ở bảng này.

- [ ] Cả A và B mở **Tin nhắn** (inbox hoặc hội thoại). A chọn bạn B → gửi “Xin chào B”. B nhận ngay trong giao diện chat, không kéo refresh. Khi B ở Home hoặc đã đóng app, mở Tin nhắn lại để tải lịch sử; chưa có badge/push chat toàn app.
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

Test tự động dùng PostgreSQL disposable và client socket thật để kiểm tra gửi/nhận, persistence, idempotency và truy cập. Việc đăng nhập hai tài khoản thật và thao tác trên hai máy ảo là bước smoke test thủ công; không coi bộ test dùng fixture là bằng chứng đã chạy UI trên hai thiết bị.
