"""
Script tải model Jina CLIP v2 từ Hugging Face về máy cục bộ.
Cách sử dụng:
    python scripts/download_model.py [--target-dir ./models/jina-clip-v2] [--model-id jinaai/jina-clip-v2]
"""

import argparse
import os
import sys
from pathlib import Path


def download_jina_model(model_id: str, target_dir: str):
    print("=" * 60)
    print(f"BẮT ĐẦU TẢI MODEL: {model_id}")
    print(f"THƯ MỤC ĐÍCH: {target_dir}")
    print("=" * 60)

    try:
        from huggingface_hub import snapshot_download
    except ImportError:
        print("\n[LỖI] Thư viện 'huggingface_hub' chưa được cài đặt!")
        print("Vui lòng chạy: pip install huggingface_hub\n")
        sys.exit(1)

    target_path = Path(target_dir).resolve()
    target_path.mkdir(parents=True, exist_ok=True)

    print(f"[1/2] Đang kết nối tới Hugging Face Hub...")
    print(f"[2/2] Đang tải các file weights và config (dung lượng tối ưu ~3.5GB)...")
    print("      (Đã tự động loại bỏ các file ONNX dư thừa ~9GB để tăng tốc)")
    print("      (Quá trình có thể mất từ 1 - 3 phút tùy tốc độ mạng)")

    try:
        downloaded_path = snapshot_download(
            repo_id=model_id,
            local_dir=str(target_path),
            local_dir_use_symlinks=False,  # Sao chép trực tiếp file, an toàn cho Windows
            resume_download=True,
            ignore_patterns=[
                "onnx/*",
                "*.onnx",
                "*.onnx_data",
                "*.openvino*",
            ],
        )
        print("\n" + "=" * 60)
        print(" TẢI MODEL THÀNH CÔNG!")
        print(f" Đường dẫn cục bộ: {downloaded_path}")
        print("=" * 60)
        print("\nBây giờ bạn có thể nạp model offline mà không cần kết nối mạng:")
        print(f"  model = AutoModel.from_pretrained(r'{downloaded_path}', trust_remote_code=True)")
    except Exception as e:
        print(f"\n[LỖI] Không thể tải model: {e}")
        sys.exit(1)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Tải model Jina CLIP v2 về máy cục bộ")
    parser.add_argument(
        "--model-id",
        type=str,
        default="jinaai/jina-clip-v2",
        help="ID model trên Hugging Face (mặc định: jinaai/jina-clip-v2)",
    )
    parser.add_argument(
        "--target-dir",
        type=str,
        default="./models/jina-clip-v2",
        help="Thư mục lưu trữ model (mặc định: ./models/jina-clip-v2)",
    )
    args = parser.parse_args()
    download_jina_model(args.model_id, args.target_dir)
