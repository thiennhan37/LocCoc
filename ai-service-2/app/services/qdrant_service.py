import uuid
from typing import List, Dict, Any, Optional
from qdrant_client import QdrantClient
from qdrant_client.http import models as qmodels
from app.core.config import settings
from app.core.logger import logger

class QdrantService:
    def __init__(self):
        self.client = QdrantClient(
            url=settings.QDRANT_URL,
            api_key=settings.QDRANT_API_KEY,
            timeout=10.0,
        )
        self.collection_name = settings.QDRANT_COLLECTION_NAME
        self.vector_dim = settings.EMBEDDING_DIM

    def ensure_collection(self):
        """Khởi tạo collection lưu trữ vector cho media nếu chưa tồn tại"""
        try:
            collections = self.client.get_collections().collections
            exists = any(c.name == self.collection_name for c in collections)
            
            if not exists:
                logger.info(f"Tạo collection mới trên Qdrant: '{self.collection_name}' với vector_dim={self.vector_dim}")
                self.client.create_collection(
                    collection_name=self.collection_name,
                    vectors_config=qmodels.VectorParams(
                        size=self.vector_dim,
                        distance=qmodels.Distance.COSINE,
                    ),
                    optimizers_config=qmodels.OptimizersConfigDiff(
                        memmap_threshold=20000,  # Lưu trên đĩa để tiết kiệm RAM khi số lượng ảnh lớn
                    )
                )

                # Tạo payload index để tìm kiếm và lọc cực nhanh theo userId và albumId
                self.client.create_payload_index(
                    collection_name=self.collection_name,
                    field_name="userId",
                    field_schema=qmodels.PayloadSchemaType.KEYWORD,
                )
                self.client.create_payload_index(
                    collection_name=self.collection_name,
                    field_name="albumId",
                    field_schema=qmodels.PayloadSchemaType.KEYWORD,
                )
                logger.info(f"Đã tạo index payload cho 'userId' và 'albumId' trên Qdrant thành công!")
            else:
                logger.info(f"Collection Qdrant '{self.collection_name}' đã tồn tại sẵn sàng.")
        except Exception as e:
            logger.warning(f"Chưa thể kết nối tới Qdrant tại {settings.QDRANT_URL}: {e}")

    def upsert_media_vector(
        self,
        media_id: str,
        user_id: str,
        vector: List[float],
        payload: Dict[str, Any],
    ) -> str:
        """
        Lưu hoặc cập nhật vector của media vào Qdrant.
        Qdrant yêu cầu point_id là UUID hoặc số nguyên.
        Ta tạo UUID ổn định (deterministic UUID5) từ media_id để tránh trùng lặp.
        """
        point_id = str(uuid.uuid5(uuid.NAMESPACE_DNS, media_id))
        
        # Đảm bảo payload luôn có thông tin định danh
        full_payload = {
            **payload,
            "mediaId": media_id,
            "userId": user_id,
        }

        point = qmodels.PointStruct(
            id=point_id,
            vector=vector,
            payload=full_payload,
        )

        self.client.upsert(
            collection_name=self.collection_name,
            points=[point],
            wait=True,
        )
        return point_id

    def search_moments(
        self,
        query_vector: List[float],
        user_id: str,
        album_id: Optional[str] = None,
        limit: int = 10,
        score_threshold: float = 0.15,
    ) -> List[Dict[str, Any]]:
        """
        Tìm kiếm khoảnh khắc ảnh/media tương đồng nhất với vector câu hỏi,
        bắt buộc lọc theo userId để đảm bảo tính riêng tư của người dùng.
        """
        filter_conditions = [
            qmodels.FieldCondition(
                key="userId",
                match=qmodels.MatchValue(value=user_id),
            )
        ]

        if album_id:
            filter_conditions.append(
                qmodels.FieldCondition(
                    key="albumId",
                    match=qmodels.MatchValue(value=album_id),
                )
            )

        qdrant_filter = qmodels.Filter(must=filter_conditions)

        # Sử dụng query_points (chuẩn Qdrant Client v1.9+) hoặc search
        try:
            results = self.client.query_points(
                collection_name=self.collection_name,
                query=query_vector,
                query_filter=qdrant_filter,
                limit=limit,
                score_threshold=score_threshold,
                with_payload=True,
            ).points
        except AttributeError:
            results = self.client.search(
                collection_name=self.collection_name,
                query_vector=query_vector,
                query_filter=qdrant_filter,
                limit=limit,
                score_threshold=score_threshold,
                with_payload=True,
            )

        items = []
        for r in results:
            items.append({
                "media_id": r.payload.get("mediaId", str(r.id)),
                "score": round(float(r.score), 4),
                "payload": r.payload,
            })
        return items

qdrant_service = QdrantService()
