import asyncio
import base64
import io
from types import SimpleNamespace
from unittest.mock import AsyncMock

import httpx
import pytest
from fastapi.testclient import TestClient
from PIL import Image
from pydantic import ValidationError

from app.core.config import Settings
from app.enhancement.errors import EnhancementError
from app.enhancement.images import validate_image
from app.enhancement.prompts import PROMPTS
from app.enhancement.provider import GeminiImageProvider
from app.main import create_app
from app.services.quota import Quota

TOKEN = "service-token-" * 4
HEADERS = {"x-service-token": TOKEN, "x-request-id": "enhancement-test"}


def settings(**overrides):
    return Settings(
        _env_file=None,
        **dict(
            IMAGE_ENHANCEMENT_ENABLED=True,
            GEMINI_API_KEY="fixture-key",
            GEMINI_IMAGE_MODEL="fixture-model",
            AI_SERVICE_TOKEN=TOKEN,
            GEMINI_ENHANCEMENT_RPM=3,
            GEMINI_ENHANCEMENT_DAILY_CAP=10,
            GEMINI_ENHANCEMENT_MONTHLY_CAP=20,
        )
        | overrides,
    )


def image(fmt="PNG", alpha=255):
    out = io.BytesIO()
    im = Image.new("RGBA", (8, 8), (30, 60, 90, alpha))
    if fmt == "JPEG":
        im = im.convert("RGB")
    im.save(out, fmt)
    return out.getvalue()


def app_fixture(config=None):
    provider = SimpleNamespace(enhance=AsyncMock(return_value=image()), close=AsyncMock())
    redis = SimpleNamespace(eval=AsyncMock(return_value=1), aclose=AsyncMock())
    return create_app(config or settings(), image_provider=provider, redis=redis), provider, redis


def upload(client, data=None, mime="image/png", filter_id="handwritten_diary", headers=None, **kwargs):
    return client.post(
        "/ai/images/enhance",
        headers=HEADERS if headers is None else headers,
        files={"image": ("photo", image() if data is None else data, mime)},
        data={"filterId": filter_id},
        **kwargs,
    )


@pytest.mark.parametrize("fmt,mime", [("JPEG", "image/jpeg"), ("PNG", "image/png"), ("WEBP", "image/webp")])
def test_image_contract_preserved_without_semantic_dependencies(fmt, mime):
    app, provider, redis = app_fixture()
    with TestClient(app) as client:
        result = upload(client, image(fmt), mime)
        assert result.status_code == 200
        assert result.content == image()
        assert result.headers["content-type"] == "image/png"
        assert result.headers["cache-control"] == "no-store"
        assert result.headers["x-request-id"] == "enhancement-test"
        assert result.headers["x-content-type-options"] == "nosniff"
        assert provider.enhance.await_args.args[2] == PROMPTS["handwritten_diary"]
        assert not hasattr(app.state, "vectors")
    provider.close.assert_awaited_once()
    redis.aclose.assert_awaited_once()


@pytest.mark.parametrize("headers", [{}, {"x-service-token": "spoof"}, {"Authorization": "Bearer spoof"}])
def test_authentication_precedes_multipart_and_provider(headers):
    app, provider, redis = app_fixture()
    with TestClient(app) as client:
        response = upload(client, headers=headers)
        assert response.status_code == 401
        assert response.headers["cache-control"] == "no-store"
    provider.enhance.assert_not_awaited()
    redis.eval.assert_not_awaited()


@pytest.mark.parametrize(
    "parts",
    [
        [("image", ("p.png", image(), "image/png"))],
        [("filterId", (None, "handwritten_diary"))],
        [("image", ("p.png", image(), "image/png")), ("filterId", (None, "unknown"))],
        [
            ("image", ("p.png", image(), "image/png")),
            ("filterId", (None, "handwritten_diary")),
            ("prompt", (None, "x")),
        ],
        [
            ("image", ("p.png", image(), "image/png")),
            ("image", ("p.png", image(), "image/png")),
            ("filterId", (None, "handwritten_diary")),
        ],
        [
            ("image", ("p.png", image(), "image/png")),
            ("filterId", (None, "subject_sticker")),
            ("filterId", (None, "handwritten_diary")),
        ],
    ],
)
def test_missing_unknown_duplicate_or_extra_fields_never_bill(parts):
    app, provider, redis = app_fixture()
    with TestClient(app) as client:
        assert client.post("/ai/images/enhance", files=parts, headers=HEADERS).status_code == 400
    provider.enhance.assert_not_awaited()
    redis.eval.assert_not_awaited()


@pytest.mark.parametrize(
    "data,mime",
    [
        (b"not-an-image", "image/png"),
        (image(), "image/jpeg"),
        (b"<svg/>", "image/svg+xml"),
        (image("JPEG")[:-1], "image/jpeg"),
    ],
)
def test_invalid_input_and_mime_spoofing(data, mime):
    app, provider, redis = app_fixture()
    with TestClient(app) as client:
        assert upload(client, data, mime).status_code == 415
    provider.enhance.assert_not_awaited()
    redis.eval.assert_not_awaited()


def test_real_config_limits_are_enforced_and_no_secrets_echoed():
    app, provider, _ = app_fixture(settings(AI_MAX_INPUT_BYTES=32))
    with TestClient(app) as client:
        assert upload(client).status_code == 413
        response = client.post(
            "/ai/images/enhance", content=b"x", headers=HEADERS | {"content-length": "999999999"}
        )
        assert response.status_code == 413
        assert TOKEN not in response.text
    provider.enhance.assert_not_awaited()


def test_oversized_chunked_body_is_bounded():
    app, provider, _ = app_fixture(settings(AI_MAX_INPUT_BYTES=32))
    with TestClient(app) as client:
        result = client.post(
            "/ai/images/enhance",
            content=iter([b"x" * 66000]),
            headers=HEADERS | {"content-type": "multipart/form-data; boundary=x"},
        )
        assert result.status_code == 413
    provider.enhance.assert_not_awaited()


@pytest.mark.parametrize(
    "output,code,status",
    [
        (b"broken", "INVALID_AI_OUTPUT", 422),
        (image()[:-20], "INVALID_AI_OUTPUT", 422),
        (b"x" * 1025, "PROVIDER_OUTPUT_TOO_LARGE", 502),
    ],
)
def test_corrupt_and_oversize_provider_images(output, code, status):
    app, provider, _ = app_fixture(settings(AI_MAX_OUTPUT_BYTES=1024))
    provider.enhance.return_value = output
    with TestClient(app) as client:
        result = upload(client)
        assert result.status_code == status
        assert result.json()["code"] == code


@pytest.mark.parametrize(
    "fmt,alpha,status", [("PNG", 0, 422), ("PNG", 254, 422), ("PNG", 255, 422), ("JPEG", 255, 422)]
)
def test_sticker_rejects_outputs_without_key_background_and_subject(fmt, alpha, status):
    app, provider, _ = app_fixture()
    provider.enhance.return_value = image(fmt, alpha)
    with TestClient(app) as client:
        assert upload(client, filter_id="subject_sticker").status_code == status


def test_sticker_endpoint_returns_transparent_png_from_provider_jpeg():
    from PIL import ImageDraw

    generated = Image.new("RGB", (64, 64), (0, 255, 0))
    draw = ImageDraw.Draw(generated)
    draw.rectangle((16, 16, 47, 47), fill="white")
    draw.rectangle((24, 24, 39, 39), fill=(0, 255, 0))
    encoded = io.BytesIO()
    generated.save(encoded, "JPEG", quality=90, subsampling=0)
    app, provider, _ = app_fixture()
    provider.enhance.return_value = encoded.getvalue()
    with TestClient(app) as client:
        response = upload(client, filter_id="subject_sticker")
        assert response.status_code == 200
        assert response.headers["content-type"] == "image/png"
        with Image.open(io.BytesIO(response.content)) as sticker:
            assert sticker.getpixel((0, 0))[3] == 0
            assert sticker.getpixel((32, 32))[3] == 255
    assert "RGB 0, 255, 0" in provider.enhance.await_args.args[2]
    provider.enhance.assert_awaited_once()


def test_pixel_limit_prevents_large_decoding():
    app, provider, _ = app_fixture(settings(AI_MAX_IMAGE_PIXELS=63))
    with TestClient(app) as client:
        assert upload(client).status_code == 415
    provider.enhance.assert_not_awaited()


@pytest.mark.parametrize("result,expected", [(0, 429), (RuntimeError("redis secret"), 503)])
def test_budget_failures_fail_closed_before_provider(result, expected):
    app, provider, redis = app_fixture()
    if isinstance(result, Exception):
        redis.eval.side_effect = result
    else:
        redis.eval.return_value = result
    with TestClient(app) as client:
        response = upload(client)
        assert response.status_code == expected
        assert "redis secret" not in response.text
    provider.enhance.assert_not_awaited()


def test_provider_error_is_safe_and_not_retried():
    app, provider, _ = app_fixture()
    provider.enhance.side_effect = RuntimeError("private-key-and-provider-payload")
    with TestClient(app) as client:
        result = upload(client)
        assert result.status_code == 502
        assert "private-key" not in result.text
    provider.enhance.assert_awaited_once()


def test_timeout_cancels_provider_coroutine():
    app, provider, _ = app_fixture(settings(AI_REQUEST_TIMEOUT_MS=100))
    cancelled = []

    async def slow(*_):
        try:
            await asyncio.sleep(5)
        finally:
            cancelled.append(True)

    provider.enhance.side_effect = slow
    with TestClient(app) as client:
        response = upload(client)
        assert response.status_code == 504
        assert response.json()["code"] == "TIMEOUT"
    assert cancelled == [True]


def test_disabled_enhancement_does_not_disable_liveness():
    with TestClient(create_app(Settings(_env_file=None, AI_SERVICE_TOKEN=TOKEN))) as client:
        assert client.get("/health").json() == {"status": "ok"}
        assert upload(client).status_code == 503


@pytest.mark.parametrize(
    "field,value",
    [
        ("AI_MAX_INPUT_BYTES", 10485761),
        ("AI_MAX_OUTPUT_BYTES", 20971521),
        ("AI_REQUEST_TIMEOUT_MS", 60001),
        ("GEMINI_API_KEY", ""),
        ("GEMINI_IMAGE_MODEL", ""),
        ("AI_SERVICE_TOKEN", "short"),
    ],
)
def test_invalid_enhancement_configuration(field, value):
    with pytest.raises(ValidationError):
        settings(**{field: value})


def provider_result(encoded=None, **extra):
    return {
        "status": "completed",
        "steps": [
            {
                "type": "model_output",
                "content": [
                    {
                        "type": "image",
                        "mime_type": "image/png",
                        "data": encoded or base64.b64encode(image()).decode(),
                        **extra,
                    },
                ],
            }
        ],
    }


async def test_adapter_preserves_fixed_prompt_disables_storage_and_automatic_continuation():
    client = SimpleNamespace(
        interactions=SimpleNamespace(create=AsyncMock(return_value=provider_result())), aclose=AsyncMock()
    )
    adapter = GeminiImageProvider(settings(), client)
    assert await adapter.enhance(image(), "image/png", PROMPTS["subject_sticker"], True) == image()
    request = client.interactions.create.await_args.kwargs
    assert request["store"] is False and request["stream"] is False
    assert request["automatic_continuation"] is False
    assert request["response_format"] == {"type": "image"}
    assert request["input"][0]["text"] == PROMPTS["subject_sticker"]
    assert "response_modalities" not in request


@pytest.mark.parametrize(
    "result",
    [
        provider_result("!!!="),
        provider_result("abcd", uri="https://untrusted/image"),
        {"status": "failed", "steps": []},
        {"status": "completed", "steps": []},
        {
            "status": "completed",
            "steps": [{"type": "model_output", "content": [{"type": "text", "text": "secret"}]}],
        },
    ],
)
async def test_adapter_rejects_invalid_base64_urls_and_nonimage_output(result):
    client = SimpleNamespace(interactions=SimpleNamespace(create=AsyncMock(return_value=result)))
    with pytest.raises(EnhancementError):
        await GeminiImageProvider(settings(), client).enhance(image(), "image/png", "fixed", False)


async def test_sdk_http_transport_sends_one_request_and_validates_real_response_shape():
    calls = []

    def handler(request):
        calls.append(request)
        return httpx.Response(200, json=provider_result())

    from google import genai
    from google.genai import types

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as http:
        sdk = genai.Client(
            api_key="fixture-key",
            http_options=types.HttpOptions(
                httpx_async_client=http, retry_options=types.HttpRetryOptions(attempts=1)
            ),
        )
        adapter = GeminiImageProvider(settings(), sdk.aio)
        assert await adapter.enhance(image(), "image/png", "fixed", False) == image()
        assert len(calls) == 1
        await adapter.close()


async def test_budget_counters_are_separate_from_embedding():
    redis = SimpleNamespace(eval=AsyncMock(return_value=1))
    await Quota(settings(), redis).reserve_enhancement()
    assert all(key.startswith("ai:enhancement:") for key in redis.eval.await_args.args[2:5])
    assert redis.eval.await_args.args[5:] == (3, 120, 10, 172800, 20, 32 * 86400)


def test_invalid_image_output_cannot_pass_direct_validation():
    with pytest.raises(EnhancementError):
        validate_image(image(), limit=1024, output=True, sticker=True)


async def test_sdk_does_not_retry_failed_billable_requests():
    calls = []

    def handler(request):
        calls.append(request)
        return httpx.Response(
            503, json={"error": {"code": 503, "message": "private-provider-message", "status": "UNAVAILABLE"}}
        )

    from google import genai
    from google.genai import types

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as http:
        sdk = genai.Client(
            api_key="fixture-key",
            http_options=types.HttpOptions(
                httpx_async_client=http, retry_options=types.HttpRetryOptions(attempts=1)
            ),
        )
        adapter = GeminiImageProvider(settings(), sdk.aio)
        with pytest.raises(EnhancementError, match="PROVIDER_FAILURE"):
            await adapter.enhance(image(), "image/png", "fixed", False)
        assert len(calls) == 1
        await adapter.close()


def asgi_scope(headers):
    return {
        "type": "http",
        "asgi": {"version": "3.0"},
        "http_version": "1.1",
        "method": "POST",
        "scheme": "http",
        "path": "/ai/images/enhance",
        "raw_path": b"/ai/images/enhance",
        "query_string": b"",
        "root_path": "",
        "server": ("test", 80),
        "client": ("127.0.0.1", 123),
        "headers": [(k.lower().encode(), v.encode()) for k, v in headers.items()],
    }


async def test_slow_upload_timeout_covers_parsing_before_provider():
    app, provider, redis = app_fixture(settings(AI_REQUEST_TIMEOUT_MS=50))
    messages = []

    async def receive():
        await asyncio.sleep(10)
        return {"type": "http.request", "body": b"", "more_body": False}

    async def send(message):
        messages.append(message)

    async with app.router.lifespan_context(app):
        await app(
            asgi_scope(HEADERS | {"content-type": "multipart/form-data; boundary=fixture"}), receive, send
        )
    assert messages[0]["status"] == 504
    provider.enhance.assert_not_awaited()
    redis.eval.assert_not_awaited()


async def test_client_disconnect_cancels_inflight_provider_without_refunding_budget():
    app, provider, redis = app_fixture()
    started, cancel = asyncio.Event(), asyncio.Event()
    disconnected_event = asyncio.Event()
    messages = []
    body = (
        b'--fixture\r\nContent-Disposition: form-data; name="filterId"\r\n\r\nhandwritten_diary\r\n'
        b'--fixture\r\nContent-Disposition: form-data; name="image"; filename="photo.png"\r\n'
        b"Content-Type: image/png\r\n\r\n" + image() + b"\r\n--fixture--\r\n"
    )
    delivered = False

    async def slow(*_):
        started.set()
        try:
            await asyncio.sleep(10)
        finally:
            cancel.set()

    async def receive():
        nonlocal delivered
        if not delivered:
            delivered = True
            return {"type": "http.request", "body": body, "more_body": False}
        await disconnected_event.wait()
        return {"type": "http.disconnect"}

    async def send(message):
        messages.append(message)

    provider.enhance.side_effect = slow
    async with app.router.lifespan_context(app):
        work = asyncio.create_task(
            app(
                asgi_scope(HEADERS | {"content-type": "multipart/form-data; boundary=fixture"}), receive, send
            )
        )
        await asyncio.wait_for(started.wait(), 2)
        disconnected_event.set()
        await asyncio.wait_for(work, 2)
    assert cancel.is_set()
    assert messages[0]["status"] == 499
    redis.eval.assert_awaited_once()


@pytest.mark.parametrize(
    "headers,body",
    [
        ({"content-type": "application/json"}, b'{"image":"not-a-file"}'),
        ({"content-type": "multipart/form-data; boundary=fixture", "content-encoding": "gzip"}, b"x"),
    ],
)
def test_nonmultipart_and_compressed_requests_never_reach_provider(headers, body):
    app, provider, redis = app_fixture()
    with TestClient(app) as client:
        assert client.post("/ai/images/enhance", headers=HEADERS | headers, content=body).status_code == 400
    provider.enhance.assert_not_awaited()
    redis.eval.assert_not_awaited()


def dual_app():
    config = settings(
        SEMANTIC_SEARCH_ENABLED=True, GEMINI_EMBEDDING_API_KEY="embedding-fixture", AI_ACTOR_SECRET="a" * 40
    )
    redis = SimpleNamespace(eval=AsyncMock(return_value=1), ping=AsyncMock(), aclose=AsyncMock())
    vectors = SimpleNamespace(
        ensure_collection=AsyncMock(),
        search=AsyncMock(return_value=[]),
        client=SimpleNamespace(
            close=AsyncMock(),
            get_collection=AsyncMock(
                return_value=SimpleNamespace(
                    config=SimpleNamespace(
                        params=SimpleNamespace(vectors=SimpleNamespace(size=768, distance="Cosine"))
                    )
                )
            ),
        ),
    )
    provider = SimpleNamespace(embed_query=AsyncMock(return_value=[1.0] + [0.0] * 767), close=AsyncMock())
    images = SimpleNamespace(enhance=AsyncMock(return_value=image()), close=AsyncMock())
    return create_app(config, provider, vectors, redis, images), provider, images, vectors


def test_failed_image_provider_does_not_break_semantic_search():
    import jwt
    import time
    from uuid import uuid4

    app, embeddings, images, _ = dual_app()
    images.enhance.side_effect = RuntimeError("image provider unavailable")
    now = int(time.time())
    token = jwt.encode(
        {
            "sub": str(uuid4()),
            "iss": "post-service",
            "aud": "loccoc-ai",
            "iat": now,
            "exp": now + 45,
            "jti": str(uuid4()),
            "op": "search",
        },
        "a" * 40,
        algorithm="HS256",
    )
    with TestClient(app) as client:
        assert upload(client).status_code == 502
        assert (
            client.post(
                "/internal/search", json={"query": "ảnh"}, headers=HEADERS | {"x-ai-actor": token}
            ).status_code
            == 200
        )
    embeddings.embed_query.assert_awaited_once()


def test_qdrant_outage_does_not_disable_image_enhancement():
    app, _, images, vectors = dual_app()
    vectors.ensure_collection.side_effect = RuntimeError("Qdrant outage")
    with TestClient(app) as client:
        assert upload(client).status_code == 200
    images.enhance.assert_awaited_once()
