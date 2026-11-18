# Kiểm thử 1536/3072 chiều và tìm kiếm theo ngày

Ngày kiểm thử: 17/11/2026, múi giờ +07. Thứ tự chạy: **1536 trước, 3072 sau**.

## Kết quả và quyết định

Đã tải 20 ảnh mới, xem trực quan và đăng bằng POST `/moments` + PUT ảnh qua
Gateway. Cùng 20 asset/version, album, caption trung tính và ngày chụp được dùng
cho hai vòng. Không thêm từ nhận diện vào caption/tags để làm đẹp kết quả.
Các ngày capturedAt là dữ liệu dựng cho kiểm thử, không phải EXIF ảnh nguồn.

| Cấu hình | Precision@3 | Recall@5 | nDCG@5 |
| --- | ---: | ---: | ---: |
| Gemini 2 — 1536, API thật | 0.5714 | 0.7286 | 0.7246 |
| Gemini 2 — 3072, API thật | 0.5714 | 0.7286 | 0.7773 |
| 768, prefix chuẩn hóa từ 3072 | 0.5714 | 0.7286 | 0.7773 |

Trung bình trên cùng 7 query có đáp án: người, xe, xe đạp, chó, mèo, cà phê,
hoa. Hai query diễn đạt lại và hai probe bổ sung không tham gia điểm trung bình.
Đánh giá graded relevance: chủ thể chính 2, liên quan phụ 1, không liên quan 0.
Ví dụ bàn tay vuốt mèo là liên quan phụ cho người, không tương đương chân dung.

**768 là đối chứng MRL, không phải một vòng gọi API 768 độc lập cho toàn bộ
corpus.** Cắt phần đầu vector 3072 của cả ảnh và query rồi chuẩn hóa lại. Kiểm
tra bổ sung qua runtime 768 thật xác nhận tìm người bằng câu tiếng Anh và bộ
lọc tháng trước hoạt động. Không suy từ 20 ảnh thành kết luận model tổng quát.

3072 tốt hơn 1536 về thứ hạng trong mẫu này, nổi bật ở query hoa. Tuy nhiên
chưa có bằng chứng để tăng dimension mặc định vì kết quả 768-prefix tương đương.
Khôi phục runtime 768, giữ cả collection 1536/3072 và 20 ảnh mới để tiếp tục xem.
13 ảnh cũ được giữ nguyên; 20 ảnh test được backfill vào collection 768 bằng MRL
prefix, không phát sinh thêm request ảnh. Tổng gallery hiện có **33 ảnh ready**.

## Phát hiện về relevance

- `xe đạp`: cả hai cấu hình đưa đúng ba ảnh xe đạp/đua xe đạp vào top 3.
- `chó`, `mèo`: hai ảnh đúng đứng đầu cả hai cấu hình.
- `xe`: hai ảnh ô tô đứng đầu; ảnh núi vẫn đứng thứ ba.
- `hoa`: 1536 đưa ảnh chó lên đầu, hoa thứ hai; 3072 đưa hoa lên đầu.
- `người`: cả hai cấu hình vẫn đưa núi/đồ ăn lên trước các ảnh chân dung. Ảnh
  tay vuốt mèo được gán relevance phụ, không coi là đã tìm đúng chân dung.
- `phương tiện giao thông`: top 3 đều là phương tiện ở cả hai cấu hình.
- `con người`: không sửa được lỗi query người.
- Probe `a photo of a person`: ba ảnh chân dung đứng đầu ở 3072 và ở kiểm tra
  native 768 sau khôi phục. Đây là bằng chứng về ảnh hưởng của cách diễn đạt,
  chưa chứng minh mọi query tiếng Anh hoặc dịch tự động đều tốt hơn.
- `bông hoa`: hoa đứng đầu ở probe 3072.
- No-answer `tàu vũ trụ`: vẫn trả 20 ảnh dù corpus không có ảnh liên quan. Chưa
  có bước calibrated rejection; tăng dimension không sửa được lỗi này.

Không sửa query mapping hay chọn threshold dựa trên chính tập test này. Các
nâng cấp tiếp theo cần query normalization có đánh giá, visual tags/caption có
bằng chứng, reranking và bộ no-answer lớn hơn; không cam kết cải thiện chỉ từ
đổi dimension. Trước production cần corpus/query held-out theo spec hiện có.

## Kiểm thử thời gian

Đã bổ sung parser cho tuần/tháng tương đối, ngày cụ thể và khoảng ngày. Ngày
sai hoặc nhiều khoảng cạnh tranh bị từ chối. Explicit UI filters giữ quy tắc
ưu tiên cũ. Mọi kết quả vẫn qua owner/state/version check ở Post.

8 prompt dưới đây được chạy qua Gateway ở **cả hai dimension: 16/16 đạt** về
dateFrom/dateTo và tập ảnh nằm trong khoảng ngày:

| Prompt | Khoảng ngày địa phương |
| --- | --- |
| xe đạp hôm nay | 17/11/2026 |
| xe đạp hôm qua | 16/11/2026 |
| xe đạp tuần trước | 09–15/11/2026, tuần bắt đầu thứ Hai |
| xe đạp tháng trước | 01–31/10/2026 |
| xe đạp tháng 10/2026 | 01–31/10/2026 |
| xe đạp ngày 15/10/2026 | 15/10/2026 |
| xe đạp từ ngày 01/10/2026 đến ngày 31/10/2026 | 01–31/10/2026 |
| xe đạp năm ngoái | 01/01–31/12/2025 |

Biên tested: 00:00:00, 23:59:59.999, đầu tháng sau, đầu/cuối tuần và năm.
Hợp đồng dateTo inclusive ở độ chính xác millisecond được giữ nguyên.

**Đúng khoảng ngày không đồng nghĩa mọi ảnh đều đúng nội dung.** Ví dụ prompt
xe đạp tháng trước trả hai ảnh xe đạp ở đầu, nhưng vẫn còn hoa/chó/lá cây phía
sau do semantic branch chưa loại ảnh yếu. Đã ghi riêng vấn đề này.

Sau khôi phục runtime 768: query xe đạp tháng trước trả HTTP 200 hybrid, 5 ảnh
trong album đúng khoảng UTC `[2026-09-30T17:00Z, 2026-10-31T16:59:59.999Z]`.
Ba API test ngày 31/02/2026, tháng 13/2026 và hôm nay tháng trước trả HTTP 400.

## Verification và ngân sách

- Java: 71 test cases, 0 failures/errors, 2 skipped integration cases; 69 chạy
  thành công. Live experiment bổ sung kiểm tra thực S3/Post/Gateway/Python/Qdrant.
- Python: 91 tests passed sau thay đổi cuối cùng; 5 launcher tests passed;
  lint/check và kiểm tra diff theo các file thay đổi.
- Đã cấu hình dimension end-to-end, validate profile/schema/shape; mặc định 768.
- Có một ingestion 3072 lỗi tạm thời; worker retry thành công. Lỗi readiness và
  cold start của môi trường thử được xử lý trước khi chấm kết quả; query đã có
  vector được tái sử dụng, không lập chỉ mục lại các ảnh đã hoàn tất.
- Bộ đếm ngày trước phép thử: 36. Sau phép thử và xác minh khôi phục: 102;
  66 reservations bổ sung gồm 40 image responses thành công, 25 query responses
  thành công và 1 ingestion reservation lỗi/không chắc billing. Không reset hay
  hoàn lại bộ đếm. Không gọi khóa Gemini image enhancement. Chi phí tiền chưa đo.
- Khi chạm cap 100, người dùng đã chấp thuận tăng tạm lên 150. Chỉ thêm hai
  trường override không phải secret trong ai-service/.env; cap gốc 100 và secret
  values giữ nguyên. Override hết hiệu lực **00:00 ngày 18/11/2026 +07**; đã test
  trước/tại thời điểm hết hạn. Counter ngày hiện tại vẫn theo cửa sổ UTC của hệ
  thống; sau khi override hết hạn, cap gốc được áp dụng lên counter đang có.
- Không xóa database/collection cũ. Tác vụ index trong Post đã hoàn tất; server
  ghi vector thử nghiệm trên 8097 đã dừng. Runtime thường dùng: Post 8089, AI 8087.

## Artifact cục bộ

Trong `logs/moment-dimensions/` (ignored, không commit ảnh/vector):

- `visual-review.html`: so top 5 có ảnh, điểm và nhãn đúng/sai theo từng query.
- `contact-sheet.jpg`, `ranking-comparison.jpg`: bảng ảnh gốc và thứ hạng.
- `photos/`: 20 ảnh tải về; `evaluation-photos.zip`: bộ ảnh/manifest đã bỏ các
  định danh phiên đăng nhập, kèm nguồn và ngày dựng.
- `api-1536.json`, `api-3072.json`: output API/temporal assertions.
- `comparison.json`: exact cosine rankings/metrics/qrels; query/image vectors
  được giữ trong local ignored files để phân tích không cần gọi API lại.
- `restored-runtime.json`, `final-validation.json`: kiểm tra runtime sau phục hồi.

Nguồn ảnh: [Unsplash License](https://unsplash.com/license), URL cụ thể và SHA-256
trong manifest. Hướng dẫn MRL/dimension: [Google embeddings](https://ai.google.dev/gemini-api/docs/embeddings).

Mã hỗ trợ tái hiện: `scripts/prepare-moment-evaluation.mjs`,
`scripts/run-moment-dimension.ps1`, `scripts/evaluate-moment-dimension.mjs`,
`ai-service/scripts/{dimension_server,analyze_dimensions,restore_evaluation_baseline}.py`.
Eval runner cần owner/session đang hoạt động qua biến môi trường hoặc manifest
cục bộ và development signing key; không dùng trên production. Query ghi vector
chỉ được bật bằng entry point dimension_server, không có trong production app.
