import io
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Query
from PIL import Image
from app.api.deps import get_jina_service
from app.services.jina_service import JinaClipService
from app.schemas.embedding import TextEmbeddingRequest, EmbeddingResponse

router = APIRouter()

@router.post("/text", response_model=EmbeddingResponse, summary="Sinh vector nhúng cho danh sách văn bản")
async def embed_text(
    payload: TextEmbeddingRequest,
    jina: JinaClipService = Depends(get_jina_service),
):
    try:
        vectors = jina.encode_text(payload.texts, truncate_dim=payload.truncate_dim)
        dim = len(vectors[0]) if vectors else 0
        return EmbeddingResponse(
            dimension=dim,
            count=len(vectors),
            embeddings=vectors,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Lỗi sinh embedding cho văn bản: {str(e)}")


@router.post("/image", summary="Sinh vector nhúng cho file ảnh")
async def embed_image(
    file: UploadFile = File(..., description="File ảnh (JPG, PNG, WEBP,...)"),
    truncate_dim: Optional[int] = Query(None, description="Chiều vector (ví dụ 512, 256)"),
    jina: JinaClipService = Depends(get_jina_service),
):
    try:
        contents = await file.read()
        image = Image.open(io.BytesIO(contents)).convert("RGB")
        vectors = jina.encode_image([image], truncate_dim=truncate_dim)
        vector = vectors[0]
        return {
            "filename": file.filename,
            "content_type": file.content_type,
            "dimension": len(vector),
            "embedding": vector,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Lỗi sinh embedding cho ảnh: {str(e)}")
