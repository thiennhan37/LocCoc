import os
from typing import List, Union
from PIL import Image
from app.core.config import settings
from app.core.logger import logger

class JinaClipService:
    _instance = None
    _model = None
    _device = None

    def __init__(self):
        self.model_path = settings.effective_model_path
        self.default_dim = settings.EMBEDDING_DIM
        self._init_device()

    def _init_device(self):
        try:
            import torch
            if settings.DEVICE == "auto":
                self._device = "cuda" if torch.cuda.is_available() else "cpu"
            else:
                self._device = settings.DEVICE
            logger.info(f"Thiết bị tính toán được chọn: {self._device.upper()}")
        except Exception as e:
            logger.warning(f"Không thể khởi tạo PyTorch device: {e}. Mặc định sử dụng CPU.")
            self._device = "cpu"

    def load_model(self):
        if self._model is not None:
            return self._model

        logger.info(f"Đang nạp model Jina CLIP v2 từ: {self.model_path}...")
        try:
            import torch
            from transformers import AutoModel

            # Nạp model với trust_remote_code=True (bắt buộc cho kiến trúc Jina CLIP v2)
            model = AutoModel.from_pretrained(
                self.model_path,
                trust_remote_code=True
            )

            if self._device == "cuda":
                # Sử dụng bfloat16 hoặc float16 để tiết kiệm VRAM và tăng tốc độ suy luận
                dtype = torch.bfloat16 if torch.cuda.is_bf16_supported() else torch.float16
                model = model.to(device=self._device, dtype=dtype)
            else:
                model = model.to(device=self._device)

            model.eval()
            self._model = model
            logger.info("Model Jina CLIP v2 đã được nạp thành công vào bộ nhớ!")
            return self._model
        except Exception as e:
            logger.error(f"Lỗi khi nạp model Jina CLIP v2: {e}")
            raise RuntimeError(
                f"Không thể nạp model từ '{self.model_path}'. "
                f"Hãy kiểm tra kết nối mạng hoặc chạy 'python scripts/download_model.py' trước. Chi tiết lỗi: {e}"
            )

    def is_loaded(self) -> bool:
        return self._model is not None

    def encode_text(self, texts: List[str], truncate_dim: int = None) -> List[List[float]]:
        """
        Sinh vector cho danh sách câu văn bản (tiếng Việt hoặc đa ngôn ngữ).
        """
        dim = truncate_dim or self.default_dim
        model = self.load_model()
        
        try:
            # jina-clip-v2 hỗ trợ encode_text với tham số truncate_dim cho MRL
            embeddings = model.encode_text(texts, truncate_dim=dim)
            if hasattr(embeddings, "tolist"):
                return embeddings.tolist()
            return [list(vec) for vec in embeddings]
        except Exception as e:
            logger.error(f"Lỗi khi sinh vector cho text: {e}")
            raise

    def encode_image(self, images: List[Image.Image], truncate_dim: int = None) -> List[List[float]]:
        """
        Sinh vector cho danh sách ảnh PIL.Image.
        """
        dim = truncate_dim or self.default_dim
        model = self.load_model()

        try:
            # jina-clip-v2 hỗ trợ encode_image với tham số truncate_dim cho MRL
            embeddings = model.encode_image(images, truncate_dim=dim)
            if hasattr(embeddings, "tolist"):
                return embeddings.tolist()
            return [list(vec) for vec in embeddings]
        except Exception as e:
            logger.error(f"Lỗi khi sinh vector cho ảnh: {e}")
            raise

# Singleton instance
jina_service = JinaClipService()
