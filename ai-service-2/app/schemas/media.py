from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field


class MediaIndexPayload(BaseModel):
    media_id: str = Field(..., description="ID định danh duy nhất của media trong LocCoc")
    user_id: str = Field(..., description="ID của người dùng sở hữu media")
    album_id: Optional[str] = Field(None, description="ID album (nếu có)")
    media_url: Optional[str] = Field(None, description="URL ảnh lưu tại SeaweedFS / S3 / MinIO")
    captured_at: Optional[str] = Field(None, description="Thời gian chụp / tạo media (ISO 8601)")
    location: Optional[str] = Field(None, description="Địa điểm chụp (ví dụ: Đà Nẵng, Hà Nội)")
    tags: Optional[List[str]] = Field(default_factory=list, description="Thẻ phân loại ảnh")
    metadata: Optional[Dict[str, Any]] = Field(default_factory=dict, description="Metadata mở rộng")


class IndexMediaResponse(BaseModel):
    status: str = "success"
    media_id: str
    user_id: str
    collection: str
    dimension: int
