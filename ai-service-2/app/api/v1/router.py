from fastapi import APIRouter
from app.api.v1.endpoints import health, embeddings, media, search

api_router = APIRouter()

api_router.include_router(health.router, tags=["Health"])
api_router.include_router(embeddings.router, prefix="/embeddings", tags=["Embeddings"])
api_router.include_router(media.router, prefix="/media", tags=["Media"])
api_router.include_router(search.router, prefix="/search", tags=["Search"])
