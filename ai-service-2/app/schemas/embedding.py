from typing import List, Optional
from pydantic import BaseModel, Field


class TextEmbeddingRequest(BaseModel):
    texts: List[str] = Field(..., min_length=1, description="Danh sách các câu text cần sinh vector")
    truncate_dim: Optional[int] = Field(None, description="Chiều vector MRL (ví dụ: 1024, 512, 256). Để None để lấy cấu hình mặc định.")


class EmbeddingResponse(BaseModel):
    dimension: int
    count: int
    embeddings: List[List[float]]
