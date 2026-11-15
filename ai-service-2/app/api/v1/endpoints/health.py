from fastapi import APIRouter, Depends
from app.core.config import settings
from app.services.jina_service import jina_service
from app.services.qdrant_service import qdrant_service

router = APIRouter()

@router.get("/health", tags=["Health"])
async def health_check():
    qdrant_ok = False
    try:
        qdrant_service.client.get_collections()
        qdrant_ok = True
    except Exception:
        qdrant_ok = False

    return {
        "status": "healthy",
        "service": settings.APP_NAME,
        "environment": settings.APP_ENV,
        "model": {
            "name_or_path": settings.effective_model_path,
            "is_loaded": jina_service.is_loaded(),
            "device": jina_service._device,
            "dimension": settings.EMBEDDING_DIM,
        },
        "qdrant": {
            "url": settings.QDRANT_URL,
            "connected": qdrant_ok,
            "collection": settings.QDRANT_COLLECTION_NAME,
        }
    }
