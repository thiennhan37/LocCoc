from app.services.jina_service import jina_service, JinaClipService
from app.services.qdrant_service import qdrant_service, QdrantService

def get_jina_service() -> JinaClipService:
    return jina_service

def get_qdrant_service() -> QdrantService:
    return qdrant_service
