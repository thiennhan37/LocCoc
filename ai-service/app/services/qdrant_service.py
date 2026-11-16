import uuid

from qdrant_client import AsyncQdrantClient, models as m

from app.core.errors import SemanticError


def point_id(owner: str, asset: str, version: int, profile: str) -> str:
    return str(uuid.uuid5(uuid.NAMESPACE_URL, f"loccoc:moment:{owner}:{asset}:{version}:{profile}"))


class QdrantService:
    def __init__(self, settings, client=None):
        self.settings = settings
        self.collection = settings.QDRANT_COLLECTION_NAME
        self.client = client or AsyncQdrantClient(
            url=settings.QDRANT_URL, api_key=settings.QDRANT_API_KEY.get_secret_value() or None, timeout=1.0
        )

    async def ensure_collection(self):
        if not await self.client.collection_exists(self.collection):
            await self.client.create_collection(
                self.collection, vectors_config=m.VectorParams(size=768, distance=m.Distance.COSINE)
            )
        info = await self.client.get_collection(self.collection)
        vectors = info.config.params.vectors
        if (
            not isinstance(vectors, m.VectorParams)
            or vectors.size != 768
            or vectors.distance != m.Distance.COSINE
        ):
            raise SemanticError("INDEX_SCHEMA_MISMATCH")
        indexes = {
            "ownerId": m.PayloadSchemaType.KEYWORD,
            "assetId": m.PayloadSchemaType.KEYWORD,
            "profileId": m.PayloadSchemaType.KEYWORD,
            "albumId": m.PayloadSchemaType.KEYWORD,
            "place": m.PayloadSchemaType.KEYWORD,
            "capturedAt": m.PayloadSchemaType.DATETIME,
        }
        for field, schema in indexes.items():
            current = info.payload_schema.get(field)
            if current and current.data_type != schema:
                raise SemanticError("INDEX_SCHEMA_MISMATCH")
            if current is None:
                await self.client.create_payload_index(self.collection, field, schema, wait=True)

    async def upsert(self, owner, asset, version, vector, metadata):
        pid = point_id(owner, asset, version, self.settings.EMBEDDING_PROFILE_ID)
        await self.client.upsert(
            self.collection,
            points=[
                m.PointStruct(
                    id=pid,
                    vector=vector,
                    payload={
                        "ownerId": owner,
                        "assetId": asset,
                        "assetVersion": version,
                        "profileId": self.settings.EMBEDDING_PROFILE_ID,
                        **metadata,
                    },
                )
            ],
            wait=True,
        )

    async def delete(self, owner, asset):
        await self.client.delete(
            self.collection,
            points_selector=m.FilterSelector(
                filter=m.Filter(
                    must=[
                        m.FieldCondition(key="ownerId", match=m.MatchValue(value=owner)),
                        m.FieldCondition(key="assetId", match=m.MatchValue(value=asset)),
                    ]
                )
            ),
            wait=True,
        )

    async def search(self, owner, vector, limit, filters=None):
        conditions = [
            m.FieldCondition(key="ownerId", match=m.MatchValue(value=owner)),
            m.FieldCondition(key="profileId", match=m.MatchValue(value=self.settings.EMBEDDING_PROFILE_ID)),
        ]
        if filters:
            if filters.album_id:
                conditions.append(m.FieldCondition(key="albumId", match=m.MatchValue(value=filters.album_id)))
            if filters.place:
                conditions.append(
                    m.FieldCondition(key="place", match=m.MatchValue(value=filters.place.lower()))
                )
            if filters.date_from or filters.date_to:
                conditions.append(
                    m.FieldCondition(
                        key="capturedAt", range=m.DatetimeRange(gte=filters.date_from, lte=filters.date_to)
                    )
                )
        result = await self.client.query_points(
            self.collection,
            query=vector,
            limit=limit,
            query_filter=m.Filter(must=conditions),
            with_payload=["assetId", "assetVersion"],
            with_vectors=False,
        )
        return [
            {"assetId": str(p.payload["assetId"]), "assetVersion": int(p.payload["assetVersion"])}
            for p in result.points
            if p.payload and "assetId" in p.payload and "assetVersion" in p.payload
        ]
