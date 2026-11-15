from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field


class SearchMomentsRequest(BaseModel):
    query: str = Field(..., description="Câu tìm kiếm bằng ngôn ngữ tự nhiên (VD: 'ảnh đi biển hè năm ngoái')")
    user_id: str = Field(..., description="ID người dùng để lọc chỉ trong khoảnh khắc của họ")
    album_id: Optional[str] = Field(None, description="Lọc theo album cụ thể (nếu có)")
    limit: int = Field(default=10, ge=1, le=100, description="Số lượng kết quả tối đa")
    score_threshold: Optional[float] = Field(default=0.15, ge=0.0, le=1.0, description="Ngưỡng điểm tương đồng tối thiểu")


class SearchResultItem(BaseModel):
    media_id: str
    score: float
    payload: Dict[str, Any]


class SearchMomentsResponse(BaseModel):
    query: str
    user_id: str
    total_results: int
    results: List[SearchResultItem]
