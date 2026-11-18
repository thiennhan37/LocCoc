"""Local opt-in evaluation server. Records query vectors only in ignored logs.

Never used by the production entry point; recording allows score/rank analysis
without paying for a second embedding of the same queries.
"""

import hashlib
import json
from pathlib import Path
from redis.asyncio import Redis
from app.core.config import Settings
from app.main import create_app
from app.services.gemini_service import GeminiService
from app.services.quota import Quota

settings = Settings()
redis = Redis.from_url(settings.REDIS_URL, socket_timeout=0.5)
directory = (
    Path(__file__).resolve().parents[2] / "logs" / "moment-dimensions" / f"queries-{settings.EMBEDDING_DIM}"
)
directory.mkdir(parents=True, exist_ok=True)


class RecordingProvider(GeminiService):
    async def embed_query(self, owner, query):
        name = hashlib.sha256((owner + query).encode()).hexdigest() + ".json"
        existing = directory / name
        if existing.exists():
            record = json.loads(existing.read_text("utf-8"))
            if (
                record["owner"] == owner
                and record["query"] == query
                and len(record["vector"]) == settings.EMBEDDING_DIM
            ):
                return record["vector"]
        vector = await super().embed_query(owner, query)
        (directory / name).write_text(
            json.dumps({"owner": owner, "query": query, "vector": vector}), encoding="utf-8"
        )
        return vector


app = create_app(settings, provider=RecordingProvider(settings, Quota(settings, redis)), redis=redis)
