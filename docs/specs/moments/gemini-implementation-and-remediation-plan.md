# Kế hoạch triển khai Gemini Embedding và sửa lỗi tìm kiếm khoảnh khắc

Ngày: 2026-11-14. Thiết kế: [ADR-015](../../adr/ADR-015-smart-moment-search.md).
Hợp đồng nghiệp vụ/test: [smart moment search](smart-moment-search.md).

**Trạng thái: kế hoạch, chưa triển khai.** Mọi task dưới đây còn Open/Planned;
không có lỗi runtime nào được đánh dấu đã sửa chỉ vì tài liệu được cập nhật.
Phạm vi là moments/search và các tích hợp liên quan, không phải audit toàn monorepo.

## 1. Kết quả cần đạt và giới hạn

- Bỏ yêu cầu GPU self-host; `ai-service-2` chạy CPU-only và gọi `gemini-embedding-2`.
- Một vector 768 chiều cho mỗi ảnh/asset, cosine trong collection Gemini riêng;
  ảnh và query cùng profile, metadata vẫn có thẩm quyền tại moment-service.
- Người dùng đăng ảnh thành công dù Gemini tạm lỗi; index pending/failed có thể
  khôi phục. Search trả rõ semantic/hybrid/metadata-only và filters thực áp dụng.
- Chặn tenant leak, ghi đè point, SSRF và đọc file trái quyền trước tích hợp UI.
- Có báo cáo chất lượng, p95/p99 live API, quota, phí và khả năng phục hồi.
- MVP không thêm video/audio, nhận diện người thân, caption generation qua Gemini
  Flash, File Search managed hoặc một Vector DB khác. Không tự xóa weights cũ.

## 2. Thành phần, quyền sở hữu và nơi thay đổi

| Thành phần | Trách nhiệm | Vị trí sẽ thay đổi/tạo |
| --- | --- | --- |
| MomentService NestJS | JWT/account authority, ownership, upload, metadata, outbox, query fusion/final ACL, presign | `moment-service/` mới; controller/service/repository/DTO và migration |
| AI API FastAPI | Async Gemini text embedding, vector validation/cache và owner-filtered Qdrant candidates | `ai-service-2/app/core`, `schemas`, `api`, `services` |
| AI worker | Claim index job, lấy processed image từ private storage, Gemini image embed, upsert, callback/retry | `ai-service-2/app/workers/`, provider/storage adapters mới |
| PostgreSQL | `moment_db` riêng, source of truth; không dùng chung bảng IAM | Bootstrap DB trong `docker/postgres/` hoặc vị trí init thực tế được xác minh lúc triển khai |
| S3-compatible storage | Private originals/processed/embedding derivatives, TTL staging | Profile media hiện có chỉ tham khảo chính sách; không đổi anonymous policy avatar |
| Qdrant | Collection/profile/indexes, candidates; không cấp quyền đọc ảnh | `qdrant_service.py`, collection bootstrap/migration có schema validation |
| Kafka | At-least-once event delivery và DLQ | Topics/config/worker theo hợp đồng ở mục 4 |
| Gateway | `/moments`, raw image PUT, quotas/timeouts, không public AI internals | Nest `service-routes.ts`/proxy/config và Spring properties/proxy/tests |
| Flutter | Upload, pending/failed, search/filter/fallback, session fences | `MobileApp/lib/features/moments/` mới và entry points hiện có |
| Ops/test/docs | CPU image/lockfile, fixtures, tests, benchmark, runbooks | AI Dockerfile/requirements, `compose.yaml`, `scripts/`, `postman/`, docs |

Giữ tên thư mục ai-service-2 để giảm đổi đường dẫn; không tạo service AI thứ hai.
Không tái dùng crop 3:1 cover hoặc public bucket cho ảnh kỷ niệm. Tận dụng common
guards và nguyên tắc validation hiện có, kiểm tra contract thực tế trước tái sử dụng.

## 3. Hợp đồng provider và cấu hình dự kiến

Interface nội bộ đề xuất, không phải SDK code đã viết:

```text
EmbeddingProvider.embed_query(query, profile, deadline) -> EmbeddingResult
EmbeddingProvider.embed_image(validated_jpeg_or_png, profile, deadline) -> EmbeddingResult
EmbeddingResult = { vector, modelId, profileId, usage?, providerRequestId? }
```

- Provider duy nhất được bật ở MVP: Gemini Developer API qua SDK chính thức có
  async support đã khóa phiên bản. Dùng `embedContent`, không yêu cầu LLM sinh
  một mảng số bằng prompt. Verify SDK interface thực tế trước viết adapter.
- Input image là processed derivative JPEG/PNG đã orientation/strip metadata;
  WebP người dùng tải lên được chuyển đổi. Giữ tỷ lệ, đề xuất cạnh dài tối đa 1536
  cho derivative ban đầu; benchmark trước chốt, không crop mất nội dung.
- Một request content cho một asset ở online ingestion. Batch backfill phải dùng
  item ID/mapping rõ ràng; kiểm tra số lượng/shape response. Nhiều parts trong một
  content có thể aggregate thành một vector, không phải batching độc lập.
- Query-format `query-v1` thử mẫu retrieval theo docs; đo với query thuần trên
  calibration, khóa template trước held-out test. Giữ Unicode NFC. Không tự thêm
  caption vào image embedding trong MVP; caption/tags được truy hồi PostgreSQL.
- Vector phải đúng 768 phần tử, finite, norm >0, kiểm tra gần unit norm với tolerance
  phù hợp. Google mô tả auto-normalization; vẫn không tin response lỗi. Không
  slice/pad vector sai, không trả vector cho Flutter hoặc log vector/ảnh/query.
- Provider exception được map thành mã nội bộ (`PROVIDER_TIMEOUT`,
  `PROVIDER_RATE_LIMITED`, `PROVIDER_UNAVAILABLE`, `PROVIDER_CONFIGURATION_ERROR`,
  `INVALID_EMBEDDING`). Không trả nguyên exception hoặc key/header ra client.

Tên biến dưới đây là **đề xuất cho implementation**, chưa tồn tại trong runtime:

| Nhóm | Biến và giá trị dự kiến | Quy tắc |
| --- | --- | --- |
| Bật tính năng | `MOMENTS_ENABLED=false`, `SEMANTIC_SEARCH_ENABLED=false` | Chỉ bật ở staging khi dependency/config/gates đủ |
| Provider | `EMBEDDING_PROVIDER=gemini`, `GEMINI_EMBEDDING_MODEL=gemini-embedding-2`, `EMBEDDING_DIM=768` | Service-local config schema, fail startup nếu profile mâu thuẫn |
| Secrets | `GEMINI_API_KEY`, `QDRANT_API_KEY`, service credentials, bucket credentials | Secret manager/process env; ví dụ để trống; không đưa vào Flutter/Git/log |
| Profile | `EMBEDDING_PROFILE_ID=gemini2-d768-imgv1-queryv1` | Mỗi thay đổi model/preprocess/query contract có version, không đổi ngầm |
| Qdrant | `QDRANT_URL`, `QDRANT_COLLECTION_NAME=moments_gemini2_d768_v1` | Kiểm tra origin/timeout/schema; không dùng collection PoC `media_moments` |
| Storage | `MOMENTS_S3_BUCKET`, private endpoint/region, object-size limits | Quyền bucket tối thiểu; không nhận endpoint/key từ public input |
| Thời hạn | Query provider timeout 2500ms, backend search deadline 4000ms, Gateway 5000ms | Điểm bắt đầu tuning; còn ngân sách cho ACL/serialization; không retry query vượt deadline |
| Upload | 10 MiB/ảnh, 40 MP, axis <=12000, decode <=10s | Giới hạn ban đầu, JPEG/PNG/WebP single-frame; bound stream trước decode |
| Cache | Text vector TTL 15 phút, bounded size | Key HMAC(owner + profile + exact canonical formatted query), không log raw query |
| Quota/cost | Query/ingest RPM/TPM allocation, daily/monthly USD cap | Bắt buộc cấu hình theo quota/budget thật trước live tests/rollout; không hardcode quota Google |

Query timeout là timeout kỹ thuật, không phải SLO. Các task tuning phải giữ deadline
nội bộ nhỏ hơn Gateway. Key cache không dùng normalization làm nhập nhằng query;
không cache search response/URL trong MVP, luôn chạy final ACL.

Liveness không gọi Gemini. Readiness kiểm tra config, Qdrant collection và trạng
thái canary có TTL; canary live do scheduler riêng, tính vào quota/budget. Config
sai báo unready; outage tạm thời đặt semantic degraded và circuit breaker, không
restart process liên tục. Phân biệt health process/metadata với semantic readiness.

## 4. Dữ liệu, events và vòng đời indexing

Schema khái niệm cho migration, chưa phải SQL đã áp dụng:

| Entity trong moment_db | Trường/bất biến chính |
| --- | --- |
| moments | UUID server-issued, ownerId, lifecycle draft/active/deleted, capturedAt, place, caption/tags, metadataVersion, timestamps |
| moment_assets | ownerId/momentId, UUID assetId, assetVersion, immutable object keys/checksum, processed bytes/dimensions, staged/active/deleted |
| moment_outbox | eventId, aggregate key, eventType, version, publish status; cùng transaction mutation |
| moment_index_jobs | jobId, owner/asset/version/profile, status pending/ready/failed, lease/fence, attempts, retryAt/errorCode; unique job tuple |
| provider_attempts | attemptId/jobId, reservation, status, usage/cost estimate, providerRequestId nếu có; không chứa ảnh/query/secrets |

Topics dự kiến: `moment.events.v1`, retry queue có lịch do job scheduler quản lý,
và `moment.index.dlq.v1`. Key gồm owner + moment để giữ thứ tự aggregate; DLQ có
eventId/jobId/error code, không bytes ảnh/URL ký. Names và retention phải được
thống nhất với conventions Kafka của repo khi triển khai.

Index event chỉ chứa IDs/version/profile, không URL public hoặc credentials.
Worker claim job qua endpoint **nội bộ** có service identity, nhận manifest từ
MomentService. Manifest gồm authoritative owner, immutable object key/checksum,
assetVersion, metadataVersion, profile và lease fence. AI không đọc moment_db.
Public request không được tạo actor context chỉ bằng tự khai owner.

Luồng thực hiện:

1. Tạo draft bằng principal đã xác minh. PUT ảnh bounded -> staged ledger ->
   validate/rotate/strip/resize giữ nội dung -> private processed + embedding object.
2. Transaction khóa aggregate, activate asset/version, enqueue outbox/job; trả
   `indexStatus=pending`. DB/S3 lỗi không làm mất ảnh đã commit trước đó.
3. Outbox publisher gửi Kafka rồi đánh dấu; redelivery được xử lý bằng unique
   job/event và lease. Worker claim job còn hợp lệ trước lấy ảnh/gọi provider.
4. Reserve cost/quota; gọi Gemini bằng bytes nội bộ; validate vector. Nếu lease
   hết hạn hoặc asset bị xóa/thay thế thì bỏ kết quả, không đánh dấu phiên bản mới ready.
5. Upsert deterministic UUID5 từ owner + assetId + assetVersion + profile; payload
   gồm IDs/version/date/album/place cần thiết, không URL ảnh. Serialize writes theo
   aggregate/fence và kiểm tra lại state trước callback ready có compare-and-set.
6. Crash sau upsert trước callback sẽ replay cùng point ID; crash sau API trước
   checkpoint có thể gọi/tính phí lại. Retry không bảo đảm billing exactly-once.
7. Xóa commit tombstone + outbox trước; final authority chặn trả ảnh/cấp URL ngay.
   Worker delete các point/version cũ, object cleanup có retry. Reconciliation dọn
   late upserts/orphans; chỉ ID ổn định hoặc payload version không đủ chặn mọi race.

Caption/date/place edit tăng metadataVersion, cập nhật payload và text index;
không tự gọi image embedding lại nếu asset bytes/profile giữ nguyên. Metadata
filter cuối ở PostgreSQL bảo vệ quyền và độ đúng khi Qdrant update còn trễ; chấp
nhận thiếu tạm kết quả cần payload mới cho tới khi cập nhật, không trả sai filter.

## 5. Search, lỗi provider và kiểm soát chi phí

Public `POST /moments/search` nhận query (NFC, nonblank, tối đa 500 ký tự rồi
kiểm tra token budget), limit 1–50, albumId/date/place hữu hạn và optional
`requireSemantic`. Không nhận owner, vector hoặc raw filter. Response DTO dự kiến:

```json
{
  "items": [],
  "mode": "hybrid",
  "semanticStatus": "available",
  "appliedFilters": {},
  "nextCursor": null,
  "requestId": "server-generated"
}
```

MomentService chạy metadata retrieval cùng owner/filter, AI query nhận actor
context/capability audience-bound có TTL ngắn do backend tin cậy cấp. AI verify
service identity + actor scope, dựng filter bắt buộc; mọi hydrate/presign vẫn
qua final PostgreSQL authority. Internal owner field chỉ hợp lệ từ manifest/actor
đã xác minh; không coi header client gửi là identity. Hợp đồng actor có tests về
expiry/audience/permission, không tự coi token cơ chế mới là đã có trong repo.

- Gemini hoạt động: cache miss -> embed query -> Qdrant; hợp nhất với metadata
  bằng RRF và final ACL/version/filter, overfetch/refill hữu hạn.
- Gemini/Qdrant lỗi: nếu có metadata path an toàn, `mode=metadata_only`,
  `semanticStatus=unavailable` và mã lý do allowlist; UI báo chức năng giới hạn.
  `requireSemantic=true` trả 503. Cả metadata/authority lỗi thì 503, không empty success.
- Cache lỗi không được làm mất ACL; khi không thể enforce quota/budget an toàn,
  fail closed với outbound Gemini và vẫn cho metadata-only nếu đủ điều kiện.
- Interactive query không auto retry; 429 có Retry-After khi áp dụng, không giữ
  request chờ lâu. Ingest tối đa 5 attempts/job, exponential backoff + jitter,
  tôn trọng Retry-After; 400/401/403 không retry vô hạn, lỗi config dừng queue/cảnh báo.
- Redis distributed limiter/budget reservation cấp lượt trước request; tách quota
  query/ingest theo project. Retry cũng phải reserve. Bộ đếm nội bộ là estimate,
  không phải billing tuyệt đối; reconcile usage thực và hạn chế chi phí bằng cap
  ứng dụng + quota/request cap. Cloud billing alert một mình không phải hard cap.
- Giữ attempt ledger cho timeout không rõ kết quả; không giả định provider có
  idempotency key khi SDK/docs chưa chứng minh. Dedupe theo job scoped owner/profile;
  không dedupe/cached ảnh chéo owner trong MVP để tránh side channel.

## 6. Backlog sửa lỗi hiện tại và phần nền tảng còn thiếu

Mức độ là ưu tiên triển khai. `Open/source` xác minh từ source, chưa exploitation
test; `Planned/new` là yêu cầu thiết kế mới, không phải bug của tính năng chưa tồn tại.
Các đường dẫn `app/...` dưới đây nằm trong ai-service-2 trừ khi nêu khác.

| ID / mức | Trạng thái, bằng chứng | Cách xử lý | Kiểm chứng hoàn thành |
| --- | --- | --- | --- |
| F01 / P0 | Open/source: `api/deps.py`, `endpoints/search.py`, `schemas/search.py` thiếu auth, public user_id | Service auth + verified actor; owner từ JWT/manifest, final ACL tại MomentService | A01/A02/A04; JWT giả/header/body owner không đổi quyền, direct calls bị chặn |
| F02 / P0 | Open/source: `qdrant_service.py` UUID5 chỉ từ media_id; index nhận owner/media tự khai | Backend-issued IDs, UUID owner/asset/version/profile, job ownership và fencing | A03/I02; cùng ID hai owner không ghi đè; event cũ không revive |
| F03 / P0 | Open/source: `endpoints/media.py` fetch media_url bất kỳ | Bỏ public URL fetch; chỉ processed object key trong trusted manifest, fixed storage adapter | A06/G08; không phát HTTP tới địa chỉ client khai; quyền bucket tối thiểu |
| F04 / P0 trước moments | Planned/new: ADR-014 công khai profile images là hành vi có chủ đích | Bucket moments private, authorize trước presign, staging cleanup | A05; anonymous Get/List/Write denied, URL expiry và deletion tests |
| F05 / P1 | Open/source: media/embedding endpoint đọc toàn bộ file trước kiểm tra | Bound streaming/MIME/magic/pixels/frames/decode/concurrency; preserve aspect ratio | A06; malformed/oversize/bomb/animation bị chặn, không OOM |
| F06 / P1 | Open/source: async handlers gọi Jina và Qdrant sync; local GPU hạn chế | Async Gemini/Qdrant, bounded queues/pool; CPU-only dependency/runtime; không blocking I/O trên event loop | P02/G01; parallel requests không bị inference sync khóa; CPU container chạy không torch/CUDA |
| F07 / P1 | Open/source: health luôn healthy, lazy load, startup nuốt lỗi | Tách live/ready, validate config/schema; provider canary TTL/job riêng | P03/G02; wrong shape/dim/config unready; không gọi trả phí mỗi health probe |
| F08 / P1 | Open/source: collection có sẵn không validate index/dim/distance | Bootstrap migration idempotent, validate schema/index/profile, không tự reset data | I04/G07; existing mismatch chặn readiness, data không bị drop |
| F09 / P1 | Open/source: capturedAt chỉ stored; chưa range filter và lifecycle | Datetime/album/place indexes, server filters, versioned delete/reconciliation | F01–F04/A04/I01–I03; đúng boundaries và xóa dù chỉ mục trễ |
| F10 / P1 | Open/source: Nest /ai giữ prefix không khớp FastAPI; Spring thiếu AI route | Public /moments tới MomentService trên cả hai; AI internal, inventory và đóng legacy /ai | Gateway E2E auth/path/raw body/limit/timeout; không public embed/index |
| F11 / P1 | Open/source: requirements lower bounds, Qdrant latest, trust_remote_code | Khóa SDK/deps/runtime/image digest; remove Jina imports/download khỏi production graph | Reproducible CPU build, import/startup không tải model; image/version manifest |
| F12 / P1 | Open/source: test_search.py một ảnh vẽ và catch/return success | Runner assertions/exit !=0; fixture/qrels/cleanup/deadlines; phân biệt fake/live | S01–S06, negative test cố tình fail trả nonzero; report không giả PASS |
| F13 / P2 | Open/source: query/batch/dim chưa bound, raw exception/payload response | DTO strict/allowlist, profile dimension do server; sanitize errors và CORS/docs nội bộ | G02/G08; oversize/extra fields bị reject, không rò payload/key |
| F14 / P1 trước API | Planned/new: chưa có quota/cost/provider failure handling | Async adapter + budget/limiter/circuit breaker + metadata fallback | G01/G04–G06; không retry storm, cap/deadline có hiệu lực |
| F15 / P1 trước rollout | Planned/new: chưa có profile migration/drift handling | New collection + canary + reconciliation + blue/green switch | G07/G09/I04; Jina/Gemini không trộn, rollback không gọi PoC thiếu auth |
| F16 / P1 trước dữ liệu thật | Planned/new: gửi ảnh ra Google và điều kiện dịch vụ | Paid project, minimize payload, notice/consent phù hợp, xác nhận audience/terms | G08; payload/log redaction và hồ sơ điều kiện sử dụng trước rollout |

F09 có ID test F01–F04 là **test filter trong spec**, khác backlog F01–F04 trong
bảng này; khi viết test dùng tên module/test descriptive để tránh nhầm namespace.

## 7. Lộ trình theo phụ thuộc và Definition of Done

Các mốc là kế hoạch, không phải báo cáo đã hoàn thành. Ước lượng cho một người
triển khai tuần tự; chưa gồm chờ API billing/quota, review sản phẩm và dataset.

| Mốc | Task nguyên tử, đầu ra | Phụ thuộc / ước lượng | Gate hoàn thành |
| --- | --- | --- | --- |
| M0 — an toàn PoC | Inventory consumer/public exposure; scope fixtures; fix F01/F02/F03; khóa route nội bộ và xác minh actor test | Không / 1–2 ngày | Không đọc/ghi chéo owner hoặc arbitrary fetch; chưa nối ảnh thật |
| M1 — adapter API | Provider interface -> Gemini transport -> strict config/DTO/vector -> async -> quota/budget/cache -> live/ready -> lockfile/CPU image | M0 / 2–3 ngày | F06/F07/F11/F13/F14; unit tests fake transport, CPU build pass |
| M2 — provider smoke | Fixture manifest -> live smoke 20 ảnh được phép -> query-format calibration -> 768 baseline -> report latency/cost | M1 + project/quota/budget / 0.5–1 ngày | Có output shape/mapping/retrieval thực, không bắt buộc local GPU |
| M3 — data/storage | moment_db migration -> repositories/transactions -> image policy/S3 ledger -> services -> controllers/DTO -> private read/delete | M0, có thể làm sau M1 / 2–3 ngày | F04/F05; DB/S3 rollback và ownership integration pass |
| M4 — indexing lifecycle | Outbox -> Kafka consumer/claim -> attempts/retry/DLQ -> upsert/callback CAS -> delete/reconciliation | M1/M3 / 2–3 ngày | F02/F08/F09; crash/race/lease/delete tests với infra cô lập |
| M5 — search/Gateway | Metadata query/parser -> vector filters -> RRF/final ACL -> DTO/cursor -> Nest/Spring route/body/quota -> legacy route retirement | M3/M4, M2 trước live / 2–3 ngày | F01/F09/F10; Gateway HTTP E2E, fallback không che lỗi |
| M6 — Flutter | API client/session fences -> upload states -> search/filter/empty/degraded -> URL renewal | M5 contract ổn định / 1–2 ngày | Widget/device checks, đổi account không hiện kết quả cũ |
| M7 — acceptance | 1k/200-query held-out -> 10k/100k load mixed ingestion -> migration/restore/rollback -> costs/monitoring/report | M2/M4/M5/M6 / 1–2 ngày + thời gian tải | Gate spec + G01–G09, budget/terms đủ; rollout feature flag |

Tổng tham khảo 11.5–19 ngày công, không phải cam kết lịch. Không yêu cầu dừng mọi
việc để đợi API key: M0/M1/M3 và fake-transport tests làm được khi chưa có API key,
theo đúng phụ thuộc giữa các mốc. M2/live
benchmark cần project được phép dùng model, key, quota và ngân sách thực; thiếu
thì ghi NOT RUN và tiếp tục phần không phụ thuộc, không tự tạo hoặc sửa secrets.

Mỗi PR gắn backlog IDs, chỉ rõ before/after, tests thực chạy, limitations và cập
nhật trạng thái. Tính năng mới theo AGENTS cần ADR/spec trước code (đã có thiết kế);
test bảo mật trước khi hoàn thành. Không thêm approval flow cho routine fixes đã
được yêu cầu; production rollout là mốc riêng theo scope thực thi khi tới bước đó.

## 8. Kế hoạch test và báo cáo

- Unit không tốn API: fake Gemini transport cho timeout/429/5xx/invalid vectors,
  batching/mapping, secret redaction, token/profile/cache, budget concurrency,
  health/circuit state. Fake đúng HTTP/SDK boundary, không chỉ mirror implementation.
- Integration: DB/schema và bucket/container riêng, Qdrant collection prefix test,
  Kafka topic prefix test; tự dọn tài nguyên test, không truy cập tables/ảnh thật.
  Auth/actor/ACL, upload/quota, outbox/replay/fence/delete là trọng tâm.
- Live smoke/quality: gọi provider thật có budget cap, fixture có quyền và manifest;
  chỉ ở Paid Services khi có ảnh cá nhân. Log IDs test và metric, không bytes/key.
- Load: 10k/100k, nhiều owner/skew/filter, C=1/5/20; cache hit/miss và metadata-only
  tách biệt. Dùng fake provider để tìm bottleneck nội bộ, live provider để xác nhận
  E2E thật; nếu chỉ scale bằng vector ngẫu nhiên thì report capacity-only.
- Output dự kiến: `docs/specs/moments/reports/` cho Markdown kết luận, JSON/CSV
  metric per query/run; ghi code/profile/SDK/config hash, corpus seed, quota, p95/
  p99 từng stage, offered/completed QPS, errors/fallback/retries và cost estimate.
  Không commit secrets, API response chứa ảnh hoặc qrels dẫn tới ảnh riêng tư.
- Gate latency mới: semantic cache miss p95 <=1500ms/p99 <=3000ms; cache hit p95
  <=200ms; 100k/C=20 với quota đủ, semantic lỗi <1%. Giá trị này là tiêu chuẩn
  nghiệm thu đề xuất, chưa đo. Gate quality/security/freshness theo spec vẫn áp dụng.

## 9. Migration, triển khai và rollback

1. **Inventory**: kiểm tra collection PoC/model/dimension và nguồn ownership.
   Không tự tin payload owner từ PoC chưa auth; khi không có authoritative source
   thì chỉ migrate fixtures hoặc upload lại có xác thực, không nhận toàn bộ point
   cũ làm dữ liệu thật. Không tự drop/rename collection gốc.
2. **Prepare**: secret injection ở service-local runtime, private bucket, moment_db,
   topics, pinned CPU image và new Qdrant collection/indexes; giữ flags false.
   Collection/profile registry gắn query adapter và dimension, không chỉ alias name.
3. **Backfill**: đọc source có quyền theo IDs, embed lại bằng Gemini; lưu checkpoint
   job/assetVersion/profile, throttle theo quota/budget. Batch API tùy chọn cho bulk,
   có reconciliation cho update/delete trong lúc chạy; không áp freshness online.
4. **Verify**: so coverage trên tài sản active/ready, sample checksums/profile,
   semantic/ACL/date tests, orphan cleanup, live cost/SLO và snapshot restore.
5. **Switch**: feature flag staging -> giới hạn nhóm người dùng -> tăng dần sau
   quan sát. Switch profile + collection + query config như một đơn vị có version;
   request in-flight giữ profile đã chọn để không trộn hai không gian vector.
6. **Rollback**: tắt semantic hoặc về profile Gemini trước còn khả dụng/an toàn;
   metadata-only vẫn qua ACL. Không trở về route Jina dễ bị khai thác hoặc giả
   định GPU cũ chạy được. Giữ schema/additive data để replay; không xóa object/
   collection trong rollback ứng dụng. Dọn artifacts cũ theo retention sau nghiệm thu.

Tự động hạ semantic/cảnh báo khi canary profile lệch, provider error/429 tăng,
budget cạn hoặc lag quá freshness. Mọi tenant leak là dừng rollout và xử lý ngay.
Metrics cần stage latency, API calls/usage/estimate/reserved cost, retries/429,
queue age/DLQ, final ACL rejects, Qdrant/DB/RSS/SSD; không label raw owner/query.

## 10. Điều kiện dữ liệu và nguồn tham chiếu

Theo terms hiện tại, Paid Services không dùng input/output để cải thiện sản phẩm,
nhưng vẫn có retention giới hạn cho an toàn. Developer API cũng có hạn chế về API
clients hướng tới/có khả năng được người dưới 18 tuổi truy cập. Xác nhận nhóm
người dùng LocCoc và tính phù hợp dịch vụ/hợp đồng trước rollout, không tự suy rằng
trả phí giải quyết mọi điều kiện. Không có thao tác gửi ảnh thật trong đợt soạn MD.

Giá kiểm tra ngày 2026-11-14: Standard text $0.20/triệu token, image ~$0.00012;
Batch text $0.10/triệu token, image ~$0.00006. Ước tính 100k ảnh Standard $12,
100k query giả định 50 input token/query ~$1; tổng ~$13 chỉ cho embedding một lượt,
chưa retry/reindex/metadata text bổ sung/storage/network/Qdrant/thuế. Giá thực và
usage cần đối chiếu billing; giảm chiều vector không tự giảm phí mỗi ảnh.

Nguồn chính thức: [model](https://ai.google.dev/gemini-api/docs/models/gemini-embedding-2),
[input/normalization/batching](https://ai.google.dev/gemini-api/docs/embeddings),
[pricing](https://ai.google.dev/gemini-api/docs/pricing#gemini-embedding-2),
[quota](https://ai.google.dev/gemini-api/docs/rate-limits),
[terms](https://ai.google.dev/gemini-api/terms).

## 11. Trạng thái kiểm chứng của đợt cập nhật này

Đã đối chiếu source/config mẫu của PoC và hai Gateway, cùng tài liệu Google chính
thức; cập nhật ADR/spec/kế hoạch/README/context. Chưa sửa code runtime, provision
infrastructure, điền secrets, gọi Gemini có tính phí, test bảo mật live hoặc đo
benchmark. Kiểm tra Markdown/link/whitespace là kiểm tra tài liệu, không phải
bằng chứng feature đã chạy hoặc backlog F01–F16 đã được giải quyết.
