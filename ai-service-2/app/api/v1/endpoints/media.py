import io
import json
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from PIL import Image
import httpx
from app.api.deps import get_jina_service, get_qdrant_service
from app.services.jina_service import JinaClipService
from app.services.qdrant_service import QdrantService
from app.schemas.media import IndexMediaResponse

router = APIRouter()

@router.post("/index", response_model=IndexMediaResponse, summary="Index ảnh và lưu vector vào Qdrant")
async def index_media(
    media_id: str = Form(..., description="ID định danh duy nhất của media"),
    user_id: str = Form(..., description="ID người dùng"),
    album_id: Optional[str] = Form(None, description="ID album (nếu có)"),
    captured_at: Optional[str] = Form(None, description="Thời gian chụp ảnh ISO 8601"),
    location: Optional[str] = Form(None, description="Địa điểm chụp"),
    tags: Optional[str] = Form(None, description="Danh sách tag cách nhau bởi dấu phẩy, VD: 'biển,hoàng hôn'"),
    media_url: Optional[str] = Form(None, description="URL ảnh nếu đã lưu trên SeaweedFS / S3"),
    file: Optional[UploadFile] = File(None, description="File ảnh tải lên trực tiếp (nếu không dùng media_url)"),
    jina: JinaClipService = Depends(get_jina_service),
    qdrant: QdrantService = Depends(get_qdrant_service),
):
    # 1. Đọc ảnh từ file hoặc từ media_url
    image: Image.Image
    if file is not None:
        contents = await file.read()
        try:
            image = Image.open(io.BytesIO(contents)).convert("RGB")
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"File tải lên không phải ảnh hợp lệ: {e}")
    elif media_url:
        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                resp = await client.get(media_url)
                resp.raise_for_status()
                image = Image.open(io.BytesIO(resp.content)).convert("RGB")
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Không thể tải ảnh từ media_url: {e}")
    else:
        raise HTTPException(status_code=400, detail="Bắt buộc phải cung cấp 'file' hoặc 'media_url'")

    # 2. Sinh vector cho ảnh bằng Jina CLIP v2
    try:
        vectors = jina.encode_image([image])
        vector = vectors[0]
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Lỗi khi sinh vector cho ảnh: {e}")

    # 3. Chuẩn bị payload
    tag_list = [t.strip() for t in tags.split(",") if t.strip()] if tags else []
    payload = {
        "mediaId": media_id,
        "userId": user_id,
        "albumId": album_id,
        "capturedAt": captured_at,
        "location": location,
        "tags": tag_list,
        "mediaUrl": media_url,
    }

    # 4. Upsert vào Qdrant
    try:
        qdrant.upsert_media_vector(
            media_id=media_id,
            user_id=user_id,
            vector=vector,
            payload=payload,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Lỗi lưu trữ vector vào Qdrant: {e}")

    return IndexMediaResponse(
        status="success",
        media_id=media_id,
        user_id=user_id,
        collection=qdrant.collection_name,
        dimension=len(vector),
    )
