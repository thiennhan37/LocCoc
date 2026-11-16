# Đánh giá database LocCoc so với ứng dụng Locket

Ngày kiểm tra: **19/10/2026**. Phạm vi: DDL và tài liệu trong `Database/`, code/migrations PostgreSQL của Auth/User, Cypher Neo4j, cấu hình triển khai và các điểm nối identity với Admin/Payment.

**Kết luận:** Thiết kế có nền tảng tốt cho MVP chia sẻ ảnh riêng tư, nhưng chưa phù hợp để đưa nguyên trạng vào LocCoc hiện tại. File SQL là **MySQL**, chưa phải PostgreSQL; schema social chưa được tích hợp; truy vấn mẫu còn thiếu kiểm soát quyền khi block, unfriend và xóa ảnh. Mục tiêu giống Locket hiện tại còn cần thêm một số mô hình nghiệp vụ.

Đây là báo cáo kiểm tra. Không sửa schema, source code, secrets hoặc dữ liệu nghiệp vụ. Các phát hiện về Cypher và truy vấn social là lỗi/thiếu sót trong bản thiết kế; chưa thể coi là lỗ hổng của API social đã triển khai.

## 1. Những gì đã được xác minh

| Thành phần | Trạng thái quan sát được |
|---|---|
| `Database/DatabaseStruct_2026_10_13.sql` | 8 bảng, cú pháp MySQL/InnoDB; không được mount bởi Compose hoặc đăng ký trong TypeORM migrations. |
| `Database/Database_Explain.md` | Mô tả MySQL + Neo4j; có DDL khác với file `.sql` ở một số FK/index. |
| `Database/neo4j.cyp` | 34 dòng: uniqueness constraint, gửi/accept request, lấy bạn/bạn chung/gợi ý. Chưa có module vận hành graph trong backend. |
| PostgreSQL đang chạy | Database `accounts`: `accounts`, `sessions`, `refresh_tokens`; database `users`: `users`. Cả hai có thêm bảng theo dõi `migrations`. Chưa có bảng moments/chat/recipients. |
| Neo4j runtime | Không thấy trong Compose, danh sách container đang chạy hoặc integration code của repo. Chưa thực thi Cypher trên Neo4j. |

Đã đọc metadata `information_schema.columns` trên PostgreSQL 17, không đọc bản ghi tài khoản, token hay dữ liệu cá nhân. Đã kiểm tra file SQL bằng `psql --single-transaction -v ON_ERROR_STOP=1` trong database `postgres`; lệnh lỗi và transaction không được lưu:

```text
psql:<stdin>:11: ERROR: syntax error at or near "ENGINE"
LINE 11: ) ENGINE=InnoDB;
```

Không chạy build/test toàn ứng dụng vì không thay đổi implementation. Chưa benchmark hay EXPLAIN với dữ liệu social, do runtime hiện chưa có schema đó.

## 2. Các phát hiện cần xử lý

### P1 — SQL social không chạy trên PostgreSQL của dự án

[SQL dòng 2](D:/workspace/LocCoc/Database/DatabaseStruct_2026_10_13.sql:2) dùng `BINARY(16)`; dòng 9–11 dùng `TINYINT`, `DATETIME(3)`, `ENGINE=InnoDB`. Các khai báo `KEY`, `UNIQUE KEY`, index tiền tố cũng là MySQL. Trong khi đó, [Auth](D:/workspace/LocCoc/auth-service/src/database/database.module.ts:21) và [User](D:/workspace/LocCoc/user-service/src/database/database.module.ts:17) cấu hình `type: 'postgres'`.

Nếu giữ kiến trúc PostgreSQL cho social, cần port thành migrations: `uuid`, `timestamptz`, `boolean`, `smallint` hoặc enum có CHECK, `jsonb` khi cần truy vấn JSON; index tạo riêng. Unique index tiền tố `push_token(255)` phải thiết kế lại, không chuyển nguyên cú pháp. PostgreSQL có kiểu UUID gốc ([tài liệu PostgreSQL 17](https://www.postgresql.org/docs/17/datatype-uuid.html)). Đây là chuyển đổi dialect và ownership, không chỉ đổi tên file.

### P1 — Identity và trách nhiệm dữ liệu chưa thống nhất

`users` trong [SQL dòng 1](D:/workspace/LocCoc/Database/DatabaseStruct_2026_10_13.sql:1) gom credentials và profile. Code hiện tại đã tách [Account](D:/workspace/LocCoc/auth-service/src/auth/entities/account.entity.ts:23) sở hữu password/role/status/verification khỏi [User profile](D:/workspace/LocCoc/user-service/src/users/entities/user.entity.ts:14), vốn dùng chính UUID do Auth cấp. Profile hiện có `full_name`, chưa có `username`, và khác độ dài/nullability với bản SQL.

Giữ một Account UUID xuyên hệ thống; Neo4j lưu UUID đó ở dạng chuỗi chuẩn. Không tạo user identity mới hoặc sao chép password sang database social. Profile có thể bổ sung username/display name qua migration. Chỉ dùng FK bên trong cùng database và ranh giới sở hữu; liên kết sang service khác cần ID tham chiếu, event và chính sách xử lý tài khoản bị xóa/khóa, theo [ADR-002](D:/workspace/LocCoc/docs/adr/ADR-002-dual-database-strategy.md:12).

Một điểm nối thực tế cần sửa trước khi gắn gói tương tự Gold: Auth/User dùng UUID nhưng [PaymentTransaction dòng 28](D:/workspace/LocCoc/payment-service/src/main/java/com/loccoc/payment/model/entity/PaymentTransaction.java:28) và [Admin API dòng 23](D:/workspace/LocCoc/admin-service/src/main/java/com/loccoc/admin/controller/UserAdminController.java:23) dùng `Long userId`. [Checkout dòng 21](D:/workspace/LocCoc/payment-service/src/main/java/com/loccoc/payment/controller/PaymentController.java:21) còn nhận header kiểu `Long`, mặc định `1`. UUID hiện tại không truyền trực tiếp qua hợp đồng này. Cần thống nhất user ID, lấy actor từ ngữ cảnh xác thực đáng tin cậy; ID tier/order có thể tiếp tục là số.

### P1 — Accept và fan-out chưa bảo vệ trường hợp bị chặn

[neo4j.cyp dòng 13](D:/workspace/LocCoc/Database/neo4j.cyp:13) accept mọi `REQUESTED` khớp mà không kiểm tra lại `BLOCKED`; [dòng 19](D:/workspace/LocCoc/Database/neo4j.cyp:19) lấy bạn để gửi ảnh cũng không loại block. Nếu pending request còn khi B chặn A, accept request đó tạo `FRIEND` bên cạnh `BLOCKED`, và truy vấn fan-out vẫn trả A. File chưa có thao tác block để bảo đảm dọn request/friendship nguyên tử.

Cần block/unblock/unfriend có transaction và state machine rõ ràng; accept phải kiểm tra actor là người nhận, không self-request, không block và tài khoản hợp lệ. Kiểm tra quyền lần nữa khi gửi, đọc ảnh, phản ứng và chat. `$from`/`$to` là parameters tốt cho truy vấn, nhưng backend vẫn phải ràng buộc chúng với actor từ JWT.

Trên Locket, block ngăn xem/gửi ảnh và gửi lời mời ([hướng dẫn chính thức](https://help.locket.com/en/articles/7915064-how-do-i-block-someone-on-locket)). Việc loại block phải bảo vệ quyền truy cập cả nội dung cũ, không chỉ danh sách nhận ảnh mới.

### P1 — Quyền xem ảnh trong SQL chưa theo kịp xóa/block/unfriend

[Query kiểm tra quyền dòng 321](D:/workspace/LocCoc/Database/Database_Explain.md:321) chỉ tìm `moment_recipients`; query feed trước đó có lọc `m.deleted_at IS NULL`. Xóa mềm không kích hoạt `ON DELETE CASCADE`. Nếu dùng nguyên query quyền để phát signed URL, ảnh đã xóa mềm vẫn được cấp quyền cho recipient cũ. Query cũng chưa thể hiện quyền của owner hoặc việc thu hồi quyền do quan hệ hiện tại.

[Tài liệu dòng 523](D:/workspace/LocCoc/Database/Database_Explain.md:523) đã nêu cần đồng bộ với Neo4j và đề xuất outbox, nhưng chưa có bảng outbox/worker/protocol tương ứng. Một transaction SQL không tự bao trùm Neo4j. Cần chốt nguồn dữ liệu chuẩn, event version/idempotency, retry/reconciliation và đường kiểm tra quyền hiện tại; không được dựa hoàn toàn vào recipient snapshot cũ hoặc cache graph chưa cập nhật để cấp URL mới. Signed URL đã phát cần TTL ngắn và chính sách cache/xóa phù hợp.

Nếu muốn sát Locket, unfriend còn phải ẩn ảnh cũ, ngừng chat và xử lý lịch sử hội thoại; kết bạn lại có thể khôi phục quyền xem ảnh từng chia sẻ. Vì vậy xóa vĩnh viễn toàn bộ recipient khi unfriend sẽ làm mất thông tin cần cho khôi phục. Nên giữ snapshot chia sẻ gốc và một cơ chế hiệu lực/thu hồi quyền riêng. Các hành vi này được mô tả trong [unfriend](https://help.locket.com/en/articles/7914985-how-do-i-unfriend-someone), còn xóa moment phải làm ảnh không còn xuất hiện với cả người nhận theo [delete Locket](https://help.locket.com/en/articles/10926929-how-to-delete-a-locket).

### P1 — Schema social và provisioning chưa được tích hợp

[User migrations](D:/workspace/LocCoc/user-service/src/database/database.module.ts:11) mới có `CreateUsersTable`; [User AppModule](D:/workspace/LocCoc/user-service/src/app.module.ts:14) chưa có controller/service nghiệp vụ social. [Compose](D:/workspace/LocCoc/compose.yaml:1) không triển khai Neo4j và không nạp file trong `Database/`.

[Register dòng 71](D:/workspace/LocCoc/auth-service/src/auth/auth.service.ts:71) lưu Account rồi gửi OTP; verify chỉ kích hoạt Account. Chưa thấy tạo profile/graph node hoặc consumer thực hiện việc đó. Cypher bắt đầu bằng `MATCH (:User ...)`, nên nếu chưa provision node thì truy vấn không thao tác được gì với tài khoản mới.

Cần luồng account verified/created → profile provisioning → graph provisioning/backfill, có retry và idempotency; đồng thời có luồng suspension/deletion xuyên các kho dữ liệu. Endpoint mới cần được ánh xạ Gateway phù hợp. Đây là phần chưa triển khai, không phải chỉ thiếu vài cột.

### P2 — Hai nguồn DDL không thống nhất; một số bảo đảm mới nằm trong tài liệu

File [SQL dòng 58](D:/workspace/LocCoc/Database/DatabaseStruct_2026_10_13.sql:58) thiếu FK participant và index danh sách chat theo từng participant; [dòng 67](D:/workspace/LocCoc/Database/DatabaseStruct_2026_10_13.sql:67) thiếu FK sender/moment; [dòng 80](D:/workspace/LocCoc/Database/DatabaseStruct_2026_10_13.sql:80) thiếu FK notification user. Embedded DDL trong [tài liệu dòng 473](D:/workspace/LocCoc/Database/Database_Explain.md:473), [492](D:/workspace/LocCoc/Database/Database_Explain.md:492) và [509](D:/workspace/LocCoc/Database/Database_Explain.md:509) lại có các thành phần đó.

Chọn migrations làm nguồn chuẩn. Thêm FK nội bộ/index thực sự cần theo ownership, không tạo FK xuyên database. Dù có FK, service vẫn phải kiểm tra sender thuộc conversation, người react có quyền xem moment và người chat được phép tham chiếu ảnh đó; FK tồn tại user/moment không bảo đảm các quyền này.

### P2 — Social state và pagination cần hoàn thiện

- [Gửi request dòng 6](D:/workspace/LocCoc/Database/neo4j.cyp:6) thiếu `a <> b`, cho phép tự gửi lời mời. Pending A→B và B→A có thể cùng tồn tại; accept chỉ xóa một chiều. Cần xử lý cả request ngược và định nghĩa kết quả cho request lặp.
- Thiếu list incoming/outgoing, reject/cancel, block/unblock, unfriend, trạng thái User và pagination. `LIMIT 20` của truy vấn gợi ý chỉ giới hạn kết quả gợi ý, không giới hạn số bạn.
- [Chat cursor dòng 341](D:/workspace/LocCoc/Database/Database_Explain.md:341) dùng riêng `created_at < :before`. Khi nhiều tin cùng millisecond nằm qua ranh giới trang sẽ bỏ sót tin. Dùng `(created_at, id)` trong cursor/order/index; áp dụng tương tự cho feed/history.
- Cần idempotency cho publish/message trên mạng di động, trạng thái upload/processing/ready/failed trước khi push, và retry/dedupe cho notification. PK recipient chống trùng một lần fan-out, nhưng không tự chống việc retry tạo hai moment có ID khác nhau.
- `push_token(255)` trong unique index chỉ xét 255 ký tự đầu của token dài tối đa 512; không đồng nghĩa unique toàn token như tài liệu mô tả. Khi port cần chốt unique toàn token hoặc fingerprint, token rotation, invalid-token cleanup và logout/unbind.

## 3. Mức đáp ứng so với Locket

Các đối chiếu dưới đây dựa trên hành vi công khai ở Help Center/Google Play ngày kiểm tra, không suy đoán database nội bộ của Locket. Đây là mục tiêu sản phẩm đề xuất; có thể ưu tiên MVP trước các phần mở rộng.

| Luồng | Bản thiết kế hiện tại | Việc cần thêm |
|---|---|---|
| Chụp ảnh/video, gửi bạn bè, lưu history | `moments`, thumbnail, recipient, index theo thời gian là nền tảng đúng. | Upload pipeline, media metadata/validation, API, push/widget và trạng thái gửi. Không lưu file ảnh trực tiếp vào SQL. |
| Chọn toàn bộ hoặc riêng người nhận | Recipient table hỗ trợ lưu danh sách cụ thể. | Kiểm tra selected recipients; lưu `audience_mode` để phân biệt ALL_FRIENDS/SELECTED. Không tự thêm bạn mới vào ảnh gửi riêng. |
| Chia sẻ ảnh cũ khi thêm bạn | Chưa có metadata để phân biệt ảnh gửi ALL_FRIENDS. | Locket cho chọn chia sẻ 30 ngày gần nhất và chỉ ảnh từng gửi All friends; cần consent/backfill đúng phạm vi ([nguồn](https://help.locket.com/en/articles/10927024-how-do-i-share-past-lockets-with-new-friends)). |
| Kết bạn qua username, danh bạ, invite link | Proposal có username/phone; graph có request/friend. | Runtime profile chưa có username; thiếu lookup/invite và workflow tương ứng. Locket hỗ trợ các cách này ([nguồn](https://help.locket.com/en/articles/7914880-how-do-i-add-friends-on-locket)). |
| Đăng ký gần trải nghiệm Locket | Auth đang bắt buộc email/password; phone bổ sung. | Nếu chọn phone-first, bổ sung verified phone và luồng SMS OTP; không coi phone có trong bảng là đã có tính năng. Locket mô tả đăng ký bằng phone và mã xác minh ([nguồn](https://help.locket.com/en/articles/5859726-why-can-t-i-sign-up-with-my-phone-number)). |
| React và trả lời ảnh | Có emoji và `messages.moment_id`; phù hợp chat 1–1. | ACL, notification, membership và idempotency. PK reaction hiện chỉ cho một emoji/người/moment; phải quyết định có giữ giới hạn này. Locket có reaction kèm thông báo ([nguồn](https://play.google.com/store/apps/details?id=com.locket.Locket)). |
| Block, unfriend, hide | Có tên quan hệ BLOCKED trong query nhưng thiếu lifecycle. | Thu hồi quyền và cache; hide là trạng thái riêng, không đồng nhất block. Locket có tính năng hide/unhide ([nguồn](https://help.locket.com/en/articles/14172862-how-do-i-hide-someone-on-locket)). |
| Giới hạn bạn theo gói | Tier hiện có limits/features JSON, nhưng social chưa thực thi. | Check quota khi accept trong transaction phù hợp, chống accept đồng thời vượt hạn mức; định nghĩa khi gói hết hạn. Locket công bố 20 bạn, Gold không giới hạn ([nguồn](https://help.locket.com/en/articles/7915024-how-many-friends-can-i-have-on-locket)). |
| Video dài hơn/theo quyền lợi gói | `media_type` phân biệt ảnh/video, chưa có duration/status. | Duration/processing/source và entitlement. Gold có upload Camera Roll, video dài hơn, streak restoration... ([nguồn](https://help.locket.com/en/articles/11057185-what-is-locket-gold-and-what-features-are-included)). |
| Rollcall/streak | Chưa có mô hình. | Rollcall cần tập ảnh theo tuần, thứ tự item, kỳ đăng và điều kiện mở xem; streak cần quy tắc ngày/múi giờ và restore. Rollcall hiện công bố tối đa 10 ảnh từ tuần qua và mở xem bạn sau khi đăng ([nguồn](https://help.locket.com/en/articles/11057175-what-is-rollcall)). |
| Group chat | `user_low/user_high` cố định chỉ biểu diễn 1–1. | Nếu làm đủ group chat, thêm conversation members và read state theo member; Locket đã đề cập group chat trong [hướng dẫn block](https://help.locket.com/en/articles/7915064-how-do-i-block-someone-on-locket). |
| Xóa tài khoản | Có status/deleted_at rải rác, chưa có lifecycle tổng thể. | Thu hồi quyền ngay, xóa/ẩn ảnh/chat/graph/device/cache và dọn object storage có retry. Locket nói dữ liệu không còn truy cập được với cả bạn bè sau khi xóa account ([nguồn](https://help.locket.com/en/articles/7914980-how-do-i-delete-my-locket-account)). |

Không cần mỗi tính năng là một bảng mới: một số cấu hình widget/theme có thể nằm ở client; một số dữ liệu như streak/recap có thể được tính hoặc materialize. Cần chốt hành vi trước khi thêm schema.

## 4. Các phần nên giữ

- Lưu `media_key`/`thumb_key` và dùng object storage; phát URL sau khi kiểm tra quyền.
- `moment_recipients` lưu snapshot chia sẻ và PK kép chống trùng recipient; index recipient/time đúng hướng cho feed/widget.
- Canonical pair `user_low < user_high` + unique pair phù hợp chat 1–1, tránh A–B và B–A thành hai chat.
- Graph tách request có hướng, đọc friendship hai chiều và query bạn chung/gợi ý là hợp lý.
- Cypher dùng parameters, uniqueness cho User ID và `MERGE ... ON CREATE` giữ timestamp ban đầu khi gọi lặp.
- `MERGE (a)-[f:FRIEND]-(b)` là cú pháp hợp lệ; Neo4j tìm cả hai chiều rồi tạo một quan hệ khi chưa có. Không phải lỗi chỉ vì pattern không có mũi tên ([Neo4j MERGE](https://neo4j.com/docs/cypher-manual/current/clauses/merge/)).
- PostgreSQL IAM hiện có session/refresh token, revocation/reuse metadata và UUID; nên mở rộng từ nền này thay vì thay bằng bảng users đơn giản của proposal.

## 5. Hướng triển khai đề xuất

1. Chốt ADR/spec cho social persistence: PostgreSQL hay MySQL, module/service nào sở hữu từng loại dữ liệu, canonical UUID và nguồn dữ liệu chuẩn của relationship. Với stack hiện tại, đề xuất PostgreSQL cho social, giữ MySQL cho Admin/Billing.
2. Chuyển DDL social thành migrations có version, đồng bộ tài liệu từ nguồn chuẩn; bổ sung profile thay vì tạo lại identity. Dùng FK nội bộ theo ranh giới database.
3. Định nghĩa ACL cùng lifecycle publish/delete/block/unfriend/re-add/history-sharing. Recipient snapshot chỉ là một thành phần của quyết định quyền.
4. Nếu dùng Neo4j, bổ sung runtime/driver/migrations constraints, node provisioning, state machine và giao thức đồng bộ có replay/retry. Một lựa chọn dễ giữ nhất quán quyền là PostgreSQL sở hữu relationship state và Neo4j là projection cho bạn chung/gợi ý. Nếu chọn Neo4j làm nguồn chuẩn, cần thiết kế rõ cách phát event và kiểm tra quyền trong lúc SQL/cache chưa theo kịp; không mặc định có transaction xuyên hai DB.
5. Triển khai MVP theo thứ tự identity/profile → friend/block → upload/moment/recipient → feed/widget/push → react/chat → entitlement; sau đó mở rộng Rollcall, streak và group chat theo phạm vi sản phẩm.

Những kiểm thử cần có trước khi hoàn thành implementation: self-request và request hai chiều; người gửi tự accept; block giữa request và accept; block/unfriend trong khi fan-out; ảnh soft-delete không cấp URL mới; người thứ ba không react/chat/xem ảnh; retry không sinh trùng moment/message; quota khi accept đồng thời; cursor có timestamp trùng; graph/consumer ngừng rồi replay; re-add khôi phục đúng phạm vi; backfill 30 ngày không lộ ảnh gửi riêng; xóa account thu hồi nội dung ở mọi nơi.

## 6. Phát hiện bổ sung ngoài schema social

Bootstrap MySQL cho Billing/Admin có vấn đề khi tạo môi trường sạch: [script dòng 14](D:/workspace/LocCoc/docker/mysql/init-databases.sql:14) chỉ tạo `tiers` trong `payment_db`, nhưng [dòng 99](D:/workspace/LocCoc/docker/mysql/init-databases.sql:99) chuyển sang `admin_db` rồi insert `tiers` mà chưa tạo bảng đó. Khi init trên volume trống, câu lệnh này sẽ lỗi nếu không có bước provisioning khác. Đây là kết luận từ luồng DDL; không xóa volume hay tái chạy bootstrap để tái hiện. Cần sửa riêng trước khi dựa vào fresh install để kiểm thử subscription/entitlement.
