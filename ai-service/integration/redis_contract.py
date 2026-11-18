import asyncio
import os

import pytest
from redis.asyncio import Redis

from app.core.config import Settings
from app.core.errors import SemanticError
from app.services.quota import Quota


@pytest.mark.asyncio
async def test_concurrent_quota_reservations_are_atomic_and_zero_is_closed():
    assert os.environ.get("POST_TEST_DB_URL", "").endswith("/moment_test"), "Use isolated runner only"
    redis = Redis.from_url(os.environ["REDIS_URL"])
    settings = Settings(
        _env_file=None,
        GEMINI_QUERY_RPM=5,
        GEMINI_INGEST_RPM=3,
        GEMINI_DAILY_REQUEST_CAP=7,
        GEMINI_MONTHLY_REQUEST_CAP=7,
        AI_ACTOR_SECRET="test-owner-secret" * 3,
        SEMANTIC_SEARCH_ENABLED=False,
    )
    quota = Quota(settings, redis)
    try:
        results = await asyncio.gather(*[quota.reserve("query") for _ in range(50)], return_exceptions=True)
        assert sum(r is None for r in results) == 5
        assert all(r is None or isinstance(r, SemanticError) for r in results)
        results = await asyncio.gather(*[quota.reserve("ingest") for _ in range(50)], return_exceptions=True)
        assert sum(r is None for r in results) == 2
        blocked = Quota(settings.model_copy(update={"GEMINI_QUERY_RPM": 0}), redis)
        with pytest.raises(SemanticError):
            await blocked.reserve("query")
        owner_limiter = Quota(settings.model_copy(update={"AI_OWNER_SEARCH_RPM": 2}), redis)
        await owner_limiter.reserve_search("owner-a")
        await owner_limiter.reserve_search("owner-a")
        with pytest.raises(SemanticError, match="OWNER_RATE_LIMITED"):
            await owner_limiter.reserve_search("owner-a")
        await owner_limiter.reserve_search("owner-b")
    finally:
        await redis.aclose()
