# ADR-015: Gemini Embedding API và Qdrant cho tìm kiếm khoảnh khắc

> Runtime update: [ADR-016](ADR-016-unified-ai-and-moment-runtime.md) supersedes
> the directory/worker topology below. Code now lives in `ai-service` and
> `moment-service`; the legacy source observations below are historical evidence.
> See the [implementation report](../specs/moments/reports/2026-11-14-runtime.md)
> for completed verification and remaining production gates.

Ngày: 2026-11-14.
Trạng thái: Chốt thiết kế và kế hoạch Gemini API; chưa triển khai runtime hoặc
nghiệm thu production. Cập nhật quyết định: 2026-11-14.

## Điều chỉnh theo ràng buộc GPU

Người dùng xác nhận không đủ GPU tự host Jina và chọn hướng Gemini API + Qdrant.
Quyết định này thay lựa chọn SigLIP 2 tự host ở phiên bản trước của ADR-015.
Jina/SigLIP không còn là phụ thuộc hoặc điều kiện benchmark bắt buộc cho MVP.
Source hiện vẫn là PoC Jina; cập nhật Markdown không đồng nghĩa đã sửa runtime.

## Bối cảnh và bằng chứng

Tệp người dùng cung cấp là đề bài đánh giá kiến trúc/PoC, chưa phải báo cáo có
kết quả benchmark. Các mục tiêu tiếng Việt, cách ly người dùng và độ trễ là đúng,
nhưng không thể suy ra chất lượng thực tế chỉ từ tên model hoặc Vector DB.

Repo có `ai-service-2`: FastAPI, Jina CLIP v2, Qdrant và script smoke test. Chưa
có miền nghiệp vụ moments, metadata có thẩm quyền, vòng đời xóa/index hoặc API
moments cho Flutter. ADR-009 trì hoãn việc đăng khoảnh khắc trong phạm vi thay đổi
cũ; ADR này xác định hướng phát triển mới, không tự tuyên bố tính năng đã tồn tại.
`.agents/rules` và `.agents/skills` không có trong checkout hiện tại.

Các điểm chặn tích hợp hiện tại:

- API AI chưa xác thực; `user_id` lấy từ body/form. Filter theo giá trị do client
  tự khai không chứng minh quyền sở hữu. Upsert dùng UUID5 chỉ từ `media_id`,
  nên hai tenant dùng cùng ID có thể ghi đè cùng point.
- API index tải `media_url` tùy ý, đọc toàn bộ body/file rồi decode; thiếu chính
  sách chặn SSRF và giới hạn byte/pixel/thời gian/concurrency ở tầng ứng dụng.
- Endpoint async gọi inference và Qdrant client đồng bộ trực tiếp. Model lazy-load,
  health luôn trả `healthy`, kể cả Qdrant lỗi hoặc model chưa được nạp.
- `capturedAt` được ghi vào payload nhưng chưa có datetime index/range filter.
  Metadata caption/tags/location chưa tham gia truy hồi hoặc xử lý câu truy vấn.
- Nest Gateway có `/ai` nhưng giữ nguyên prefix `/ai`; FastAPI nhận `/api/v1`.
  Spring Gateway chưa có route AI. Mapping hiện tại chưa phải tích hợp hoàn chỉnh.
- Script hiện tại vẽ một ảnh, chủ yếu in kết quả, bắt lỗi rồi tiếp tục/return;
  thiếu assertions về relevance, tenant isolation và exit code thất bại.
- Qdrant dùng image `latest`; Python dependencies chỉ có lower bounds;
  `trust_remote_code=True` chưa khóa revision.

## Quyết định

1. **MVP chỉ tìm ảnh của chính người dùng.** JPEG/PNG/WebP tĩnh, câu tiếng Việt,
   caption/tags và bộ lọc thời gian/địa điểm; album khi có metadata và quyền sở hữu
   tương ứng. Video/audio, nhận diện người thân, OCR chi tiết hóa đơn và tìm ảnh
   bạn bè nằm ngoài MVP. Không suy ra danh tính/quan hệ từ vẻ ngoài trong ảnh.
2. **Tách `moment-service` bằng NestJS**, theo Controller -> Service -> Repository/
   DTO, tái sử dụng thư viện bảo mật chung. Sở hữu `moment_db` PostgreSQL riêng
   trên hạ tầng PostgreSQL hiện có; Auth/User vẫn sở hữu tài khoản/quan hệ. AI
   không truy cập trực tiếp database của các service này.
3. **Object storage riêng tư** qua S3-compatible storage hiện có. Tạo bucket/policy
   riêng cho moments, không dùng bucket avatar/cover đang cho anonymous GetObject.
   URL tải ảnh được cấp sau kiểm tra quyền, thời hạn ngắn. Thu hồi quyền chặn việc
   cấp URL mới ngay; URL đã cấp có thể còn hiệu lực tới hết TTL.
4. **Giữ Qdrant** làm chỉ mục dẫn xuất có thể xây dựng lại. PostgreSQL là nguồn
   quyết định owner, trạng thái, phiên bản và xóa; Qdrant không giữ URL công khai
   hoặc dữ liệu hồ sơ nhạy cảm. Không triển khai đồng thời Milvus/pgvector.
5. **Chọn `gemini-embedding-2` qua Gemini Developer API, Paid Services**, output
   768 chiều, Qdrant cosine. Index ảnh và embed query dùng cùng embedding profile;
   kiểm tra shape/finite/norm. Không dùng text-only `gemini-embedding-001` cho ảnh.
   1536/3072 chỉ là đối chứng nếu 768 chưa đạt chất lượng trong ngân sách.
6. **Giữ `ai-service-2` FastAPI/Python làm adapter và worker CPU-only**: I/O async,
   Gemini client và Qdrant client; tháo Jina/PyTorch/CUDA/model download khỏi startup
   và dependency production. Interface provider hỗ trợ thay thế có kiểm soát,
   không tự fallback sang model local. Tạo JPEG/PNG derivative cho embedding từ
   ảnh đã kiểm tra; một asset tạo một vector, không gộp nhiều ảnh độc lập thành một.
7. **Sinh image embedding bất đồng bộ**: staged private object -> kiểm tra và
   chuẩn hóa ảnh -> transaction metadata + outbox -> Kafka -> worker -> Qdrant.
   Upload không chờ inference. Trạng thái index: `pending`, `ready`, `failed`.
   Query text được embed qua API khi tìm kiếm, với deadline, quota và cache hữu hạn.
8. **Truy hồi kết hợp nội dung và metadata**: image-vector candidates trong Qdrant
   và caption/tags/place text candidates trong PostgreSQL; hợp nhất bằng RRF, áp
   dụng cùng owner/filter và kiểm tra cuối từ PostgreSQL. Không cộng trực tiếp
   cosine score với text rank. Thời gian/địa điểm cụ thể phải dựa trên metadata,
   không kỳ vọng embedding đoán ngày chụp hoặc địa danh chính xác từ ảnh.
9. **Mọi API công khai đi qua `/moments` trên cả hai Gateway.** AI chỉ có API nội
   bộ, xác thực service-to-service; Flutter không được gọi embed/index trực tiếp.
   Owner lấy từ JWT đã xác minh và trạng thái tài khoản có thẩm quyền. Không tin
   `user_id`, object key, owner header hay raw Qdrant filter từ client.
10. **Không mở production theo mặc định.** Hoàn thiện PoC bảo mật và benchmark
    trước, tiếp theo mới tích hợp UI bằng feature flag. Nếu model mặc định không
    đạt tiêu chí chất lượng/tải, giữ No-Go và xem lại model/hạ tầng; không hạ âm
    thầm tiêu chí hoặc tự động đổi model/nhà cung cấp.
11. **Quản lý phụ thuộc API**: tách quota query/ingest, retry hữu hạn, circuit
    breaker, budget reservation và cache text vector theo owner/profile. API key
    chỉ ở backend. Metadata-only fallback được trả rõ ràng; không che semantic
    lỗi bằng empty result hoặc dùng fallback để làm đẹp chỉ số latency.
12. **Migration tạo collection/profile mới**, không trộn Jina/SigLIP với Gemini.
    Ghi model ID, SDK version, preprocessing/query-format version; API alias không
    bảo đảm weights bất biến nên cần canary drift và reindex theo profile khi đổi.

## Vì sao chọn phương án này

| Phương án | Đánh giá cho LocCoc | Kết luận |
| --- | --- | --- |
| Qdrant | Đã có PoC/Compose; payload filtering, index và vận hành AI độc lập; thêm chi phí đồng bộ/backup | Chọn, có kiểm tra quyền cuối từ PostgreSQL |
| pgvector | Hợp lý ở 10k–100k; có thể đặt trong moment_db để giảm một datastore; ANN filtering cần tuning và iterative scans | Phương án thay thế khi chi phí vận hành Qdrant không phù hợp; không phải công nghệ yếu hơn mặc định |
| Milvus | Có thể đáp ứng bài toán, nhưng chưa có nhu cầu/chứng cứ ở repo để đổi stack và thêm công vận hành | Chưa chọn |
| Gemini Embedding 2 API | Không cần GPU local; hỗ trợ cross-modal; có network/quota/phí API và gửi dữ liệu bên thứ ba | Chọn 768 chiều cho MVP, benchmark trước rollout |
| Jina/SigLIP tự host | Tự vận hành model/VRAM; không phù hợp ràng buộc phần cứng hiện tại | Không nằm trong critical path hoặc fallback tự động |

Đổi sang API làm thay đổi ngân sách độ trễ. `<200ms` vẫn là mục tiêu tối ưu,
không còn là gate bắt buộc cho cache miss có gọi Gemini. Gate MVP đề xuất:
p95 server E2E <=1500ms, p99 <=3000ms gồm outbound API; cache-hit p95 <=200ms;
100k vector/C=20 khi quota đáp ứng. Đây là ngưỡng thiết kế chưa đo; báo cáo semantic
thành công, cache hit/miss và fallback riêng. Không bỏ auth/final ACL để đạt SLO.

Máy phát triển hiện có GTX 1650 4096 MiB. Không suy luận FPS/VRAM peak từ kích
thước weights. `.venv` AI đang dùng Python 3.13.5 và thiếu metadata các package
torch/transformers/qdrant-client/FastAPI khi kiểm tra. Có file model Jina cục bộ
không đồng nghĩa dịch vụ đã chạy hay checkpoint đã được xác minh đầy đủ.

## Hệ quả và giới hạn

- Cần xây nền tảng lưu moments trước khi tích hợp semantic search. Không tái dùng
  thao tác crop cover/avatar cho ảnh kỷ niệm; chỉ dùng lại nguyên tắc validation.
- Outbox + consumer idempotency giải quyết mất/nhân đôi sự kiện; không tuyên bố
  exactly-once qua PostgreSQL, Kafka và Qdrant. Tombstone/version cùng kiểm tra
  cuối bảo vệ lúc chỉ mục bị trễ; reconciliation xử lý stale/orphan vectors.
- Bổ sung model adapter, versioned collection và reindex có kiểm chứng trước khi
  đổi model. Cùng số chiều không có nghĩa cùng không gian embedding; không hứa
  pin được weights của model API nếu nhà cung cấp không có revision bất biến.
- Với profile Gemini, giảm 3072 -> 768 giảm 75% **bytes vector float32**, không
  giảm tương ứng toàn bộ RAM Qdrant/HNSW/payload/cache hoặc phí API.
- Benchmark và ngân sách vận hành là phần bắt buộc còn lại; đợt đánh giá này chỉ
  sửa tài liệu quyết định, không triển khai service, sửa secrets hay chạy benchmark.

Chi tiết: [đánh giá, đặc tả và kế hoạch kiểm chứng](../specs/moments/smart-moment-search.md).
Thực thi: [kế hoạch Gemini, migration và backlog sửa lỗi](../specs/moments/gemini-implementation-and-remediation-plan.md).

## Dữ liệu bên thứ ba và chi phí

Ảnh/query được gửi sang Google; Qdrant local không đồng nghĩa xử lý hoàn toàn local.
Chỉ gửi derivative cần thiết, không ownerId/email/JWT/GPS/secrets. Paid Services
không dùng input/output để cải thiện sản phẩm theo điều khoản hiện hành, nhưng
vẫn có retention giới hạn cho an toàn; không tuyên bố zero retention. Trước rollout
phải xác nhận thông tin xử lý bên thứ ba và đối tượng sử dụng: điều khoản Developer
API hiện hạn chế API client hướng tới/có khả năng được người dưới 18 tuổi truy cập;
nếu LocCoc phục vụ nhóm này, cần giải quyết tính phù hợp dịch vụ/hợp đồng trước.

Giá tham khảo ngày 2026-11-14: Standard text $0.20/triệu input token, image khoảng
$0.00012/ảnh; Batch text $0.10/triệu token, image khoảng $0.00006/ảnh. 100k ảnh
Standard khoảng $12/một lượt index, chưa gồm query/retry/reindex/storage/network/
Qdrant/thuế. Batch dùng cho backfill; không giả định có freshness như online.
Xác nhận giá/quota và đặt ngân sách trước rollout.

## Nguồn kiểm chứng ngày 2026-11-14

- [Gemini Embedding 2](https://ai.google.dev/gemini-api/docs/models/gemini-embedding-2),
  [embedding API](https://ai.google.dev/gemini-api/docs/embeddings),
  [giá](https://ai.google.dev/gemini-api/docs/pricing#gemini-embedding-2),
  [quota](https://ai.google.dev/gemini-api/docs/rate-limits),
  [điều khoản dữ liệu và đối tượng sử dụng](https://ai.google.dev/gemini-api/terms).
- Nguồn model local dưới đây giữ làm tham chiếu cho quyết định cũ đã được thay thế.
- [Jina CLIP v2 model card và License](https://huggingface.co/jinaai/jina-clip-v2).
- [SigLIP 2 Base model card và License](https://huggingface.co/google/siglip2-base-patch16-256),
  [nghiên cứu SigLIP 2](https://arxiv.org/abs/2502.14786),
  [cấu hình SigLIP trong Transformers](https://huggingface.co/docs/transformers/model_doc/siglip).
- [Qdrant payload/tenant indexing](https://qdrant.tech/documentation/manage-data/indexing/),
  [storage](https://qdrant.tech/documentation/manage-data/storage/),
  [optimizer và đơn vị ngưỡng](https://qdrant.tech/documentation/ops-optimization/optimizer/).
- [pgvector filtering và iterative scans](https://github.com/pgvector/pgvector#filtering).
