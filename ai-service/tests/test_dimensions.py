from types import SimpleNamespace
from unittest.mock import AsyncMock
from datetime import datetime
import pytest
from qdrant_client import AsyncQdrantClient
from app.core.config import Settings
from app.core.errors import SemanticError
from app.services.gemini_service import GeminiService
from app.services.qdrant_service import QdrantService
from app.services.quota import Quota


def test_temporary_daily_cap_expires_without_resetting_usage():
    s = Settings(
        _env_file=None,
        GEMINI_DAILY_REQUEST_CAP=100,
        GEMINI_DAILY_REQUEST_CAP_OVERRIDE=150,
        GEMINI_DAILY_REQUEST_CAP_OVERRIDE_UNTIL="2026-11-18T00:00:00+07:00",
    )
    q = Quota(s, AsyncMock())
    assert q.daily_request_cap(datetime.fromisoformat("2026-11-17T23:59:59+07:00")) == 150
    assert q.daily_request_cap(datetime.fromisoformat("2026-11-18T00:00:00+07:00")) == 100
    with pytest.raises(ValueError):
        Settings(_env_file=None, GEMINI_DAILY_REQUEST_CAP_OVERRIDE=150)
    with pytest.raises(ValueError):
        Settings(_env_file=None, GEMINI_DAILY_REQUEST_CAP_OVERRIDE_UNTIL="2026-11-18T00:00:00")


@pytest.mark.parametrize("dim", [768, 1536, 3072])
async def test_dimension_controls_provider_validation_and_collection(dim):
    s = Settings(_env_file=None, EMBEDDING_DIM=dim, QUERY_TRANSLATION_ENABLED=False)
    assert s.EMBEDDING_PROFILE_ID == f"gemini2-d{dim}-imgv1-queryv1"
    client = SimpleNamespace(
        models=SimpleNamespace(
            embed_content=AsyncMock(
                return_value=SimpleNamespace(embeddings=[SimpleNamespace(values=[1.0] + [0.0] * (dim - 1))])
            )
        )
    )
    provider = GeminiService(s, SimpleNamespace(reserve=AsyncMock()), client)
    assert len(await provider.embed_query("owner", "xe")) == dim
    assert client.models.embed_content.await_args.kwargs["config"].output_dimensionality == dim
    client.models.embed_content.return_value.embeddings[0].values = [1.0] + [0.0] * (dim - 2)
    with pytest.raises(SemanticError, match="INVALID_EMBEDDING"):
        await provider.embed_image(b"jpeg")
    q = AsyncQdrantClient(":memory:")
    v = QdrantService(s, q)
    await v.ensure_collection()
    assert (await q.get_collection(s.QDRANT_COLLECTION_NAME)).config.params.vectors.size == dim
    await q.close()


def test_dimension_mismatches_fail_closed():
    assert Settings(_env_file=None, EMBEDDING_DIM="1536").EMBEDDING_DIM == 1536
    with pytest.raises(ValueError):
        Settings(_env_file=None, EMBEDDING_DIM=1024)
    with pytest.raises(ValueError):
        Settings(_env_file=None, EMBEDDING_DIM=1536, EMBEDDING_PROFILE_ID="gemini2-d768-imgv1-queryv1")
    with pytest.raises(ValueError):
        Settings(_env_file=None, EMBEDDING_DIM=3072, QDRANT_COLLECTION_NAME="moments_gemini2_d768_v1")
