import io
import base64
import time
from types import SimpleNamespace
from unittest.mock import AsyncMock
from uuid import uuid4

import jwt
import pytest
from fastapi.testclient import TestClient
from PIL import Image
from qdrant_client import AsyncQdrantClient, models as m

from app.core.config import Settings
from app.core.errors import SemanticError
from app.core.security import cache_key
from app.main import create_app
from app.services.gemini_service import GeminiService, validate_vector
from app.services.qdrant_service import QdrantService, point_id
from app.services.quota import Quota


OWNER = str(uuid4())
OTHER = str(uuid4())
ASSET = str(uuid4())


def settings(**kwargs):
    kwargs.setdefault("QUERY_TRANSLATION_ENABLED", False)
    return Settings(
        _env_file=None,
        SEMANTIC_SEARCH_ENABLED=True,
        GEMINI_EMBEDDING_API_KEY="fake-key",
        AI_SERVICE_TOKEN="s" * 40,
        AI_ACTOR_SECRET="a" * 40,
        **kwargs,
    )


def headers(op="search", owner=OWNER, **claims):
    now = int(time.time())
    token = jwt.encode(
        {
            "sub": owner,
            "iss": "post-service",
            "aud": "loccoc-ai",
            "iat": now,
            "exp": now + 45,
            "op": op,
            "jti": str(uuid4()),
            **claims,
        },
        "a" * 40,
        algorithm="HS256",
    )
    return {"x-service-token": "s" * 40, "x-ai-actor": token}


def vectors():
    client = AsyncMock()
    client.get_collection.return_value = SimpleNamespace(
        config=SimpleNamespace(
            params=SimpleNamespace(vectors=m.VectorParams(size=768, distance=m.Distance.COSINE))
        )
    )
    return SimpleNamespace(
        client=client,
        ensure_collection=AsyncMock(),
        search=AsyncMock(return_value=[]),
        upsert=AsyncMock(),
        delete=AsyncMock(),
    )


def redis_mock():
    client = AsyncMock()
    client.eval.return_value = 1
    return client


def test_no_public_ai_or_legacy_endpoints():
    with TestClient(create_app(Settings(_env_file=None))) as c:
        assert c.get("/health/live").status_code == 200
        for path in ["/api/v1/search", "/api/v1/embeddings/text", "/api/v1/media/index", "/docs"]:
            assert c.post(path).status_code in (401, 404)
        assert c.post("/internal/search", json={"query": "biển"}).status_code == 401


@pytest.mark.parametrize(
    "claims",
    [
        {"exp": 0},
        {"aud": "other"},
        {"iss": "other"},
        {"iss": "moment-service"},
        {"sub": "not-a-uuid"},
        {"op": "delete:wrong"},
        {"exp": int(time.time()) + 5000},
    ],
)
def test_actor_rejects_spoofing(claims):
    v = vectors()
    provider = SimpleNamespace(close=AsyncMock(), embed_query=AsyncMock())
    with TestClient(create_app(settings(), provider, v, AsyncMock())) as c:
        r = c.post("/internal/search", headers=headers(**claims), json={"query": "biển"})
        assert r.status_code == 401
        provider.embed_query.assert_not_awaited()


@pytest.mark.parametrize(
    "body",
    [
        {"query": " "},
        {"query": "a" * 501},
        {"query": "beach", "user_id": OTHER},
        {"query": "beach", "vector": [1]},
        {"query": "a", "limit": True},
        {"query": "a", "limit": 201},
        {"query": "a", "date_from": "2026-11-10T00:00:00Z", "date_to": "2026-11-01T00:00:00Z"},
    ],
)
def test_strict_request_and_no_input_echo(body):
    with TestClient(create_app(settings(), SimpleNamespace(close=AsyncMock()), vectors(), AsyncMock())) as c:
        r = c.post("/internal/search", headers=headers(), json=body)
        assert r.status_code == 422
        assert r.json() == {"code": "INVALID_REQUEST"}


def test_authenticated_owner_drives_filter_not_headers():
    v = vectors()
    p = SimpleNamespace(close=AsyncMock(), embed_query=AsyncMock(return_value=[1.0] + [0.0] * 767))
    with TestClient(create_app(settings(), p, v, redis_mock())) as c:
        r = c.post("/internal/search", headers={**headers(), "x-user-id": OTHER}, json={"query": "biển"})
        assert r.status_code == 200
        assert v.search.await_args.args[0] == OWNER
        assert "vector" not in r.text


def test_readiness_is_honest_and_never_calls_provider():
    v = vectors()
    v.ensure_collection.side_effect = SemanticError("INDEX_SCHEMA_MISMATCH")
    p = SimpleNamespace(close=AsyncMock(), embed_query=AsyncMock())
    with TestClient(create_app(settings(), p, v, AsyncMock())) as c:
        assert c.get("/health/live").status_code == 200
        assert c.get("/health/ready", headers=headers("health")).status_code == 503
        p.embed_query.assert_not_awaited()


def test_readiness_requires_recent_provider_success_without_billing_health_probe():
    p = SimpleNamespace(close=AsyncMock(), embed_query=AsyncMock(), last_success=0)
    with TestClient(create_app(settings(), p, vectors(), redis_mock())) as c:
        r = c.get("/health/ready", headers=headers("health"))
        assert r.status_code == 503
        assert r.json()["code"] == "PROVIDER_NOT_VERIFIED"
        p.embed_query.assert_not_awaited()


def test_media_is_bounded_and_url_fetch_cannot_be_requested():
    v = vectors()
    p = SimpleNamespace(close=AsyncMock(), embed_image=AsyncMock(return_value=[1.0] + [0.0] * 767))
    with TestClient(create_app(settings(), p, v, AsyncMock())) as c:
        h = {
            **headers(f"index:{ASSET}:1"),
            "content-type": "image/jpeg",
            "x-ai-metadata": base64.urlsafe_b64encode(b'{"capturedAt":"2026-11-14T00:00:00Z"}').decode(),
        }
        assert (
            c.put(f"/internal/assets/{ASSET}/1", headers=h, content=b"x" * (2 * 1024 * 1024 + 1)).status_code
            == 413
        )
        assert (
            c.put(f"/internal/assets/{ASSET}/1", headers=h, content=b"https://169.254.169.254").status_code
            == 400
        )
        assert (
            c.put(
                f"/internal/assets/{ASSET}/1",
                headers={**h, "content-type": "image/svg+xml"},
                content=b"<svg/>",
            ).status_code
            == 415
        )
        p.embed_image.assert_not_awaited()
        image = io.BytesIO()
        Image.new("RGB", (32, 16), "blue").save(image, "JPEG")
        assert c.put(f"/internal/assets/{ASSET}/1", headers=h, content=image.getvalue()).status_code == 200
        assert v.upsert.await_args.args[:3] == (OWNER, ASSET, 1)


@pytest.mark.parametrize(
    "vector",
    [
        [0.0] * 768,
        [1.0] * 767,
        [float("nan")] + [0.0] * 767,
        [float("inf")] + [0.0] * 767,
        [True] + [0.0] * 767,
        [1.0] * 768,
    ],
)
def test_invalid_vectors_never_enter_index(vector):
    with pytest.raises(SemanticError, match="INVALID_EMBEDDING"):
        validate_vector(vector)


def test_point_ids_include_owner_version_profile():
    assert point_id(OWNER, ASSET, 1, "v1") != point_id(OTHER, ASSET, 1, "v1")
    assert point_id(OWNER, ASSET, 1, "v1") != point_id(OWNER, ASSET, 2, "v1")
    assert point_id(OWNER, ASSET, 1, "v1") != point_id(OWNER, ASSET, 1, "v2")
    assert cache_key("secret", OWNER, "v1", "biển") != cache_key("secret", OTHER, "v1", "biển")


def test_legacy_paid_keys_cannot_be_used_as_embedding_fallback(monkeypatch):
    monkeypatch.setenv("GEMINI_API_KEY", "legacy-paid-placeholder")
    monkeypatch.setenv("GOOGLE_API_KEY", "legacy-paid-placeholder")
    monkeypatch.delenv("GEMINI_EMBEDDING_API_KEY", raising=False)
    configured = Settings(_env_file=None)
    assert configured.GEMINI_EMBEDDING_API_KEY.get_secret_value() == ""
    with pytest.raises(SemanticError, match="PROVIDER_CONFIGURATION_ERROR"):
        GeminiService(configured, SimpleNamespace(reserve=AsyncMock()))


def test_invalid_startup_configuration_does_not_echo_key():
    with pytest.raises(ValueError) as error:
        Settings(_env_file=None, SEMANTIC_SEARCH_ENABLED=True,
                 GEMINI_EMBEDDING_API_KEY='startup-secret-must-never-appear')
    assert 'startup-secret-must-never-appear' not in str(error.value)


async def test_qdrant_real_local_tenant_isolation_and_scoped_delete():
    client = AsyncQdrantClient(":memory:")
    v = QdrantService(settings(), client)
    await v.ensure_collection()
    vector = [1.0] + [0.0] * 767
    await v.upsert(OWNER, ASSET, 1, vector, {"capturedAt": "2026-11-14T00:00:00Z"})
    await v.upsert(OTHER, ASSET, 1, vector, {"capturedAt": "2026-11-14T00:00:00Z"})
    assert await v.search(OWNER, vector, 10) == [{"assetId": ASSET, "assetVersion": 1}]
    await v.delete(OWNER, ASSET)
    assert await v.search(OWNER, vector, 10) == []
    assert len(await v.search(OTHER, vector, 10)) == 1
    await client.close()


async def test_existing_schema_mismatch_is_rejected_without_reset():
    client = AsyncQdrantClient(":memory:")
    s = settings()
    await client.create_collection(
        s.QDRANT_COLLECTION_NAME, vectors_config=m.VectorParams(size=512, distance=m.Distance.COSINE)
    )
    with pytest.raises(SemanticError, match="INDEX_SCHEMA_MISMATCH"):
        await QdrantService(s, client).ensure_collection()
    assert (await client.get_collection(s.QDRANT_COLLECTION_NAME)).config.params.vectors.size == 512
    await client.close()


async def test_provider_cache_is_owner_scoped_and_single_image_content():
    client = SimpleNamespace(
        aclose=AsyncMock(),
        models=SimpleNamespace(
            embed_content=AsyncMock(
                return_value=SimpleNamespace(embeddings=[SimpleNamespace(values=[1.0] + [0.0] * 767)])
            )
        ),
    )
    quota = SimpleNamespace(reserve=AsyncMock())
    p = GeminiService(settings(), quota, client)
    await p.embed_query(OWNER, "biển")
    await p.embed_query(OWNER, "biển")
    await p.embed_query(OTHER, "biển")
    assert client.models.embed_content.await_count == 2
    await p.embed_image(b"image")
    contents = client.models.embed_content.await_args.kwargs["contents"]
    assert len(contents.parts) == 1
    assert contents.parts[0].inline_data.mime_type == "image/jpeg"


async def test_provider_timeout_is_bounded_no_retry_and_sanitized():
    async def slow(**_kwargs):
        import asyncio

        await asyncio.sleep(1)

    client = SimpleNamespace(models=SimpleNamespace(embed_content=AsyncMock(side_effect=slow)))
    p = GeminiService(settings(PROVIDER_TIMEOUT_SECONDS=0.01), SimpleNamespace(reserve=AsyncMock()), client)
    with pytest.raises(SemanticError, match="PROVIDER_TIMEOUT"):
        await p.embed_query(OWNER, "biển")
    assert client.models.embed_content.await_count == 1


async def test_quota_failure_prevents_provider_call():
    quota = SimpleNamespace(reserve=AsyncMock(side_effect=SemanticError("QUOTA_UNAVAILABLE")))
    client = SimpleNamespace(models=SimpleNamespace(embed_content=AsyncMock()))
    p = GeminiService(settings(), quota, client)
    with pytest.raises(SemanticError, match="QUOTA_UNAVAILABLE"):
        await p.embed_query(OWNER, "biển")
    client.models.embed_content.assert_not_awaited()
    redis = AsyncMock()
    redis.eval.side_effect = RuntimeError("connection secret=SHOULD_NOT_ESCAPE")
    with pytest.raises(SemanticError, match="QUOTA_UNAVAILABLE"):
        await Quota(settings(), redis).reserve("query")
