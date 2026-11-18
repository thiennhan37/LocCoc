import asyncio
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from app.core.errors import SemanticError
from app.services.gemini_service import GeminiService
from test_security_and_search import settings, headers, redis_mock, vectors
from app.main import create_app
from fastapi.testclient import TestClient
from google.genai import errors


def provider(**overrides):
    client = SimpleNamespace(
        models=SimpleNamespace(
            generate_content=AsyncMock(return_value=SimpleNamespace(text='{"english_query":"people"}')),
            embed_content=AsyncMock(
                return_value=SimpleNamespace(embeddings=[SimpleNamespace(values=[1.0] + [0.0] * 767)])
            ),
        )
    )
    quota = SimpleNamespace(reserve=AsyncMock())
    return GeminiService(settings(QUERY_TRANSLATION_ENABLED=True, **overrides), quota, client), client, quota


async def test_english_embedding_uses_owner_scoped_versioned_translation_cache():
    p, client, quota = provider()
    await p.embed_query("alice", "người")
    assert (
        client.models.embed_content.await_args.kwargs["contents"].parts[0].text
        == "task: search result | query: people"
    )
    await p.embed_query("alice", "người")
    assert client.models.generate_content.await_count == 1
    assert client.models.embed_content.await_count == 1
    await p.embed_query("bob", "người")
    assert client.models.generate_content.await_count == 2
    assert quota.reserve.await_count == 4  # Translation + embedding, once per owner.
    request = client.models.generate_content.await_args.kwargs
    assert request["contents"] == "người"
    assert request["config"].response_mime_type == "application/json"
    assert request["config"].http_options.timeout >= 10000
    assert "negation" in request["config"].system_instruction


async def test_concurrent_identical_queries_share_translation():
    p, client, quota = provider()
    await asyncio.gather(*(p.embed_query("alice", "người") for _ in range(5)))
    assert client.models.generate_content.await_count == 1
    assert client.models.embed_content.await_count == 1
    assert quota.reserve.await_count == 2


@pytest.mark.parametrize(
    "text",
    [
        "",
        "{}",
        "not json",
        '{"english_query":""}',
        '{"english_query":"' + "a" * 501 + '"}',
        '{"english_query":"people","extra":true}',
    ],
)
async def test_invalid_translation_does_not_embed_or_echo_source(text):
    p, client, _ = provider()
    client.models.generate_content.return_value.text = text
    with pytest.raises(SemanticError, match="QUERY_TRANSLATION_UNAVAILABLE"):
        await p.translator.to_english("alice", "private query")
    client.models.embed_content.assert_not_awaited()


async def test_translation_quota_prevents_outbound_calls():
    p, client, quota = provider()
    quota.reserve.side_effect = SemanticError("PROVIDER_QUOTA_EXHAUSTED", 429)
    with pytest.raises(SemanticError, match="PROVIDER_QUOTA_EXHAUSTED"):
        await p.embed_query("alice", "người")
    client.models.generate_content.assert_not_awaited()
    client.models.embed_content.assert_not_awaited()


async def test_translation_timeout_has_no_retry_or_raw_error():
    p, client, _ = provider(PROVIDER_TIMEOUT_SECONDS=0.01)

    async def slow(**kwargs):
        await asyncio.sleep(1)

    client.models.generate_content.side_effect = slow
    vector = await p.embed_query("alice", "người")
    assert client.models.generate_content.await_count == 1
    assert len(vector) == 768
    assert (
        client.models.embed_content.await_args.kwargs["contents"].parts[0].text
        == "task: search result | query: người"
    )


@pytest.mark.parametrize(
    ("status", "expected"),
    [
        (400, "QUERY_TRANSLATION_CONFIGURATION_ERROR"),
        (429, "PROVIDER_RATE_LIMITED"),
        (503, "QUERY_TRANSLATION_UNAVAILABLE"),
    ],
)
async def test_provider_errors_are_classified_without_echoing_details(status, expected):
    p, client, _ = provider()
    client.models.generate_content.side_effect = errors.APIError(
        status, {"error": {"message": "private-provider-detail"}}
    )
    with pytest.raises(SemanticError, match=expected) as caught:
        await p.translator.to_english("alice", "người")
    assert "private-provider-detail" not in str(caught.value)
    assert client.models.generate_content.await_count == 1
    client.models.embed_content.assert_not_awaited()


@pytest.mark.parametrize("query", ["người", "people"])
async def test_translation_failure_preserves_visual_search_and_cached_results(query, caplog):
    p, client, quota = provider()
    client.models.generate_content.return_value.text = "invalid json"
    result = await p.embed_query("alice", query)
    assert len(result) == 768
    assert (
        client.models.embed_content.await_args.kwargs["contents"].parts[0].text
        == f"task: search result | query: {query}"
    )
    await p.embed_query("alice", query)
    assert client.models.generate_content.await_count == 1
    assert client.models.embed_content.await_count == 1
    assert quota.reserve.await_count == 2
    assert query not in caplog.text


def test_translation_failure_returns_sanitized_internal_error_without_vector_search():
    v = vectors()
    p = SimpleNamespace(
        close=AsyncMock(), embed_query=AsyncMock(side_effect=SemanticError("QUERY_TRANSLATION_UNAVAILABLE"))
    )
    with TestClient(create_app(settings(), p, v, redis_mock())) as c:
        response = c.post("/internal/search", headers=headers(), json={"query": "người"})
    assert response.status_code == 503
    assert response.json() == {"code": "QUERY_TRANSLATION_UNAVAILABLE"}
    v.search.assert_not_awaited()
