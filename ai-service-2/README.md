# LocCoc AI Service 2 (Jina CLIP v2 & Qdrant)

Microservice chịu trách nhiệm sinh vector nhúng đa phương tiện (**Multimodal Vector Embeddings**) bằng mô hình **Jina CLIP v2 (`jinaai/jina-clip-v2`)** và lưu trữ/truy vấn khoảnh khắc ảnh/media qua **Vector Database Qdrant** cho nền tảng LocCoc.

---

## 1. Kiến Trúc & Tính Năng Nổi Bật

*   **Model Jina CLIP v2:**
    *   Hỗ trợ tiếng Việt tự nhiên và 89+ ngôn ngữ bản địa.
    *   MRL (Matryoshka Representation Learning): Cho phép rút gọn chiều vector (1024 -> 512 hoặc 256) giúp tiết kiệm 50-75% RAM trên Vector DB.
    *   Cross-modal: Cùng 1 không gian vector cho cả câu chữ (Text) và hình ảnh (Image).
*   **Vector Database Qdrant:**
    *   Viết bằng Rust, hiệu năng truy vấn cực cao.
    *   Payload filtering cực mạnh theo `userId`, `albumId`, `capturedAt` (bảo đảm quyền riêng tư từng user).
    *   Tự động index HNSW và tối ưu bộ nhớ lưu trên đĩa (mmap).

---

## 2. Cách Tải Model Jina CLIP v2 Về Máy Cục Bộ

Bạn có 3 cách để tải model về máy:

### Cách 1: Sử dụng script tải tự động (Khuyến nghị)
Trong thư mục `ai-service-2/`:
```bash
python scripts/download_model.py
```
*Script sẽ tự động tải các file weights (`model.safetensors`, tokenizer, preprocessor, config) về thư mục `./models/jina-clip-v2` (~3.5 GB). Quá trình hỗ trợ resume nếu mất mạng.*

### Cách 2: Sử dụng Hugging Face CLI
```bash
pip install huggingface_hub
huggingface-cli download jinaai/jina-clip-v2 --local-dir ./models/jina-clip-v2 --local-dir-use-symlinks False
```

### Cách 3: Nạp tự động trong runtime
Nếu không tải trước, khi khởi động service và gọi API lần đầu tiên, thư viện `transformers` sẽ tự động tải model về cache mặc định của máy tính (`~/.cache/huggingface/hub/`).

---

## 3. Cài Đặt & Chạy Service

### Bước 1: Khởi động Qdrant Vector DB bằng Docker
Trong file `compose.yaml` ở thư mục gốc LocCoc, service Qdrant đã được tích hợp:
```bash
docker compose up -d qdrant
```
*Giao diện Web Dashboard của Qdrant có thể xem tại: [http://localhost:6333/dashboard](http://localhost:6333/dashboard)*

### Bước 2: Cài đặt thư viện Python
Khuyến nghị tạo môi trường ảo Python 3.10 hoặc 3.11:
```bash
cd ai-service-2
python -m venv .venv
# Trên Windows:
.venv\Scripts\activate
# Trên Linux/Mac:
source .venv/bin/activate

pip install -r requirements.txt
```

### Bước 3: Cấu hình biến môi trường
Tạo file `.env` từ file mẫu:
```bash
cp .env.example .env
```
*(Chỉnh sửa cổng hoặc URL Qdrant nếu cần).*

### Bước 4: Khởi chạy AI Service 2
```bash
uvicorn app.main:app --host 0.0.0.0 --port 8088 --reload
```
*Swagger UI tài liệu API tương tác trực tiếp tại: [http://localhost:8088/docs](http://localhost:8088/docs)*

---

## 4. Danh Sách REST APIs

| Method | Endpoint | Mô tả |
| :--- | :--- | :--- |
| `GET` | `/api/v1/health` | Kiểm tra trạng thái service, model và kết nối Qdrant |
| `POST` | `/api/v1/embeddings/text` | Nhận danh sách câu văn bản -> Trả về danh sách vector (512-dim) |
| `POST` | `/api/v1/embeddings/image` | Upload file ảnh -> Trả về vector nhúng của ảnh |
| `POST` | `/api/v1/media/index` | Upload ảnh/URL kèm metadata (`userId`, `tags`,...) -> Embed và lưu vào Qdrant |
| `POST` | `/api/v1/search/moments` | Tìm kiếm ảnh bằng câu tự nhiên (VD: "bãi biển hoàng hôn") theo `userId` |

---

## 5. Ví Dụ Gọi API (cURL)

### 1. Sinh vector cho văn bản tiếng Việt
```bash
curl -X POST "http://localhost:8088/api/v1/embeddings/text" \
     -H "Content-Type: application/json" \
     -d '{"texts": ["chuyến dã ngoại mùa hè với bạn bè", "hóa đơn tiền điện"], "truncate_dim": 512}'
```

### 2. Index một ảnh vào Qdrant
```bash
curl -X POST "http://localhost:8088/api/v1/media/index" \
     -F "file=@/path/to/my_photo.jpg" \
     -F "media_id=photo_001" \
     -F "user_id=user_abc" \
     -F "album_id=summer_vacation" \
     -F "location=Đà Nẵng" \
     -F "tags=biển,nghỉ dưỡng,gia đình"
```

### 3. Tìm kiếm khoảnh khắc bằng ngôn ngữ tự nhiên
```bash
curl -X POST "http://localhost:8088/api/v1/search/moments" \
     -H "Content-Type: application/json" \
     -d '{
       "query": "ảnh chụp ở biển với gia đình",
       "user_id": "user_abc",
       "limit": 10,
       "score_threshold": 0.15
     }'
```

---

## 6. Chạy Script Kiểm Thử Tự Động
```bash
python scripts/test_search.py --base-url http://localhost:8088
```


## Coexistence with Gemini and posts

AI2 defaults to port 8088; Gemini uses 8082 and post-service uses 8087.
`AI_SERVICE_URL` and Gateway `/ai/*` belong to Gemini.
`AI_SEARCH_SERVICE_URL` is reserved for AI2; `/ai-search/*` is not exposed in
this merge because AI2 ownership checks are deferred. See
[the integration decision](../docs/adr/ADR-015-separate-ai-services.md).
Existing local `.env` files are preserved; an existing `PORT=8087` overrides
the new code default until the developer updates it.
