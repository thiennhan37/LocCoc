from fastapi import APIRouter, Depends, HTTPException
from app.api.deps import get_jina_service, get_qdrant_service
from app.services.jina_service import JinaClipService
from app.services.qdrant_service import QdrantService
from app.schemas.search import SearchMomentsRequest, SearchMomentsResponse, SearchResultItem

router = APIRouter()

@router.post("/moments", response_model=SearchMomentsResponse, summary="Tìm kiếm khoảnh khắc ảnh/media bằng ngôn ngữ tự nhiên")
async def search_moments(
    payload: SearchMomentsRequest,
    jina: JinaClipService = Depends(get_jina_service),
    qdrant: QdrantService = Depends(get_qdrant_service),
):
    # 1. Sinh vector cho câu query tự nhiên (tiếng Việt hoặc đa ngôn ngữ)
    try:
        vectors = jina.encode_text([payload.query])
        query_vector = vectors[0]
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Lỗi sinh vector cho câu truy vấn: {str(e)}")

    # 2. Tìm kiếm trong Qdrant lọc theo user_id (và album_id nếu có)
    try:
        raw_results = qdrant.search_moments(
            query_vector=query_vector,
            user_id=payload.user_id,
            album_id=payload.album_id,
            limit=payload.limit,
            score_threshold=payload.score_threshold,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Lỗi tìm kiếm trên Qdrant: {str(e)}")

    items = [
        SearchResultItem(
            media_id=r["media_id"],
            score=r["score"],
            payload=r["payload"],
        )
        for r in raw_results
    ]

    return SearchMomentsResponse(
        query=payload.query,
        user_id=payload.user_id,
        total_results=len(items),
        results=items,
    )
