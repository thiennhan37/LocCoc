"""
Script kiểm thử nhanh end-to-end cho AI Service 2.
Cách chạy:
    python scripts/test_search.py [--base-url http://localhost:8087]
"""

import argparse
import io
import sys
import httpx
from PIL import Image, ImageDraw


def run_tests(base_url: str):
    print("=" * 60)
    print(f"BẮT ĐẦU KIỂM THỬ AI-SERVICE-2 TẠI: {base_url}")
    print("=" * 60)

    client = httpx.Client(base_url=base_url, timeout=30.0)

    # 1. Health check
    print("\n[Bước 1] Kiểm tra sức khỏe dịch vụ (GET /api/v1/health)...")
    try:
        res = client.get("/api/v1/health")
        print(f"Status Code: {res.status_code}")
        print("Response:", res.json())
        assert res.status_code == 200
    except Exception as e:
        print(f"[THẤT BẠI] Không thể kết nối tới server: {e}")
        return

    # 2. Text embedding
    print("\n[Bước 2] Thử nghiệm sinh vector văn bản tiếng Việt (POST /api/v1/embeddings/text)...")
    sample_texts = [
        "Hoàng hôn trên bãi biển Mỹ Khê Đà Nẵng",
        "Hóa đơn thanh toán siêu thị ngày hôm qua",
        "Bé gái mặc váy đỏ đang chơi cầu trượt",
    ]
    try:
        res = client.post("/api/v1/embeddings/text", json={"texts": sample_texts, "truncate_dim": 512})
        data = res.json()
        print(f"Status Code: {res.status_code}")
        print(f"Sinh thành công {data.get('count')} vector. Chiều vector: {data.get('dimension')}")
        assert res.status_code == 200
    except Exception as e:
        print(f"[LỖI] Sinh text embedding thất bại: {e}")

    # 3. Tạo một ảnh mẫu mô phỏng và Index vào Qdrant
    print("\n[Bước 3] Tạo ảnh mẫu và Index vào Qdrant (POST /api/v1/media/index)...")
    try:
        # Tạo 1 ảnh vẽ cảnh biển đơn giản bằng PIL
        img = Image.new("RGB", (300, 200), color=(135, 206, 235))  # Sky blue
        draw = ImageDraw.Draw(img)
        draw.rectangle([0, 120, 300, 200], fill=(238, 214, 175))   # Sand
        draw.ellipse([200, 30, 260, 90], fill=(255, 140, 0))       # Sunset sun

        img_byte_arr = io.BytesIO()
        img.save(img_byte_arr, format="JPEG")
        img_bytes = img_byte_arr.getvalue()

        files = {"file": ("sunset_beach.jpg", img_bytes, "image/jpeg")}
        form_data = {
            "media_id": "photo_test_001",
            "user_id": "user_demo_123",
            "album_id": "album_summer_2024",
            "captured_at": "2024-07-15T17:45:00Z",
            "location": "Đà Nẵng",
            "tags": "biển,hoàng hôn,mùa hè",
        }

        res = client.post("/api/v1/media/index", data=form_data, files=files)
        print(f"Status Code: {res.status_code}")
        print("Response:", res.json())
    except Exception as e:
        print(f"[LỖI] Index ảnh thất bại: {e}")

    # 4. Tìm kiếm ảnh bằng ngôn ngữ tự nhiên
    print("\n[Bước 4] Tìm kiếm khoảnh khắc bằng tiếng Việt (POST /api/v1/search/moments)...")
    try:
        search_payload = {
            "query": "khoảnh khắc mặt trời lặn trên bờ biển",
            "user_id": "user_demo_123",
            "limit": 5,
            "score_threshold": 0.1,
        }
        res = client.post("/api/v1/search/moments", json=search_payload)
        data = res.json()
        print(f"Status Code: {res.status_code}")
        print(f"Truy vấn: '{data.get('query')}'")
        print(f"Tìm thấy: {data.get('total_results')} kết quả phù hợp:")
        for idx, item in enumerate(data.get("results", []), 1):
            print(f"  {idx}. Media ID: {item['media_id']} | Score: {item['score']} | Tags: {item['payload'].get('tags')}")
    except Exception as e:
        print(f"[LỖI] Tìm kiếm thất bại: {e}")

    print("\n" + "=" * 60)
    print("HOÀN THÀNH KIỂM THỬ!")
    print("=" * 60)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Test AI Service 2")
    parser.add_argument("--base-url", default="http://localhost:8087", help="Base URL của AI Service 2")
    args = parser.parse_args()
    run_tests(args.base_url)
