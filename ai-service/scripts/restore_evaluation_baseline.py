"""Backfill the 20 test assets into 768 using normalized MRL prefixes.

No provider calls; existing 768 points and original photos are preserved. Only
the benchmark album's current 3072 points are copied with new profile identities.
"""

import asyncio
import json
import math
from pathlib import Path
from qdrant_client import models as m
from app.core.config import Settings
from app.services.qdrant_service import QdrantService

ROOT = Path(__file__).resolve().parents[2]


async def main():
    manifest = json.loads((ROOT / "logs/moment-dimensions/manifest.json").read_text("utf-8"))
    settings = Settings(
        _env_file=ROOT / "ai-service/.env",
        EMBEDDING_DIM=768,
        EMBEDDING_PROFILE_ID="",
        QDRANT_COLLECTION_NAME="",
    )
    vectors = QdrantService(settings)
    try:
        await vectors.ensure_collection()
        points, _ = await vectors.client.scroll(
            "moments_gemini2_d3072_v1",
            scroll_filter=m.Filter(
                must=[m.FieldCondition(key="albumId", match=m.MatchValue(value=manifest["albumId"]))]
            ),
            limit=50,
            with_vectors=True,
            with_payload=True,
        )
        expected = {x["id"] for x in manifest["items"]}
        if len(points) != 20 or {p.payload["assetId"] for p in points} != expected:
            raise ValueError("Incomplete benchmark collection")
        for point in points:
            payload = point.payload
            v = point.vector[:768]
            norm = math.sqrt(sum(x * x for x in v))
            metadata = {key: payload.get(key) for key in ["capturedAt", "albumId", "place"]}
            await vectors.upsert(
                payload["ownerId"],
                payload["assetId"],
                payload["assetVersion"],
                [x / norm for x in v],
                metadata,
            )
        print("Backfilled 20 normalized MRL prefixes into the 768 baseline; provider calls: 0")
    finally:
        await vectors.client.close()


if __name__ == "__main__":
    asyncio.run(main())
