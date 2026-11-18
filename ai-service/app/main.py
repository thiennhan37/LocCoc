import asyncio
import base64
import io
import logging
import time
from contextlib import asynccontextmanager
from uuid import UUID

from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from PIL import Image
from redis.asyncio import Redis

from app.core.config import Settings
from app.core.body_limit import BodyLimit
from app.core.errors import SemanticError
from app.core.security import actor
from app.schemas.search import SearchRequest, IndexMetadata
from app.services.gemini_service import GeminiService
from app.services.qdrant_service import QdrantService
from app.services.quota import Quota
from app.enhancement.router import router as enhancement_router
from app.enhancement.provider import GeminiImageProvider
from app.enhancement.service import EnhancementService
from app.enhancement.errors import EnhancementError


def check_image(data: bytes):
    try:
        with Image.open(io.BytesIO(data)) as image:
            if image.format != "JPEG" or max(image.size) > 1536 or image.width * image.height > 1536 * 1536:
                raise ValueError()
            image.verify()
    except Exception:
        raise HTTPException(400, detail="Invalid processed image") from None


def create_app(settings=None, provider=None, vectors=None, redis=None, image_provider=None):
    settings = settings or Settings()

    @asynccontextmanager
    async def lifespan(app):
        app.state.ready = False
        app.state.schema_error = False
        if settings.SEMANTIC_SEARCH_ENABLED or settings.IMAGE_ENHANCEMENT_ENABLED:
            app.state.redis = redis or Redis.from_url(
                settings.REDIS_URL, socket_timeout=0.5, socket_connect_timeout=0.5
            )
            app.state.quota = Quota(settings, app.state.redis)
        if settings.IMAGE_ENHANCEMENT_ENABLED:
            app.state.image_provider = image_provider or GeminiImageProvider(settings)
            app.state.enhancement = EnhancementService(settings, app.state.image_provider, app.state.quota)
        if settings.SEMANTIC_SEARCH_ENABLED:
            app.state.vectors = vectors or QdrantService(settings)
            app.state.provider = provider or GeminiService(settings, app.state.quota)
            try:
                async with asyncio.timeout(10):
                    await app.state.vectors.ensure_collection()
                    app.state.ready = True
            except Exception:
                # Keep liveness up during dependency outages, but readiness stays
                # closed. Requests can retry schema bootstrap after recovery.
                app.state.ready = False
        yield
        if settings.SEMANTIC_SEARCH_ENABLED:
            await app.state.provider.close()
            await app.state.vectors.client.close()
        if settings.IMAGE_ENHANCEMENT_ENABLED:
            await app.state.image_provider.close()
        if settings.SEMANTIC_SEARCH_ENABLED or settings.IMAGE_ENHANCEMENT_ENABLED:
            await app.state.redis.aclose()

    app = FastAPI(
        title="LocCoc AI Service", lifespan=lifespan, docs_url=None, redoc_url=None, openapi_url=None
    )
    app.include_router(enhancement_router)
    app.state.settings = settings
    app.add_middleware(BodyLimit, settings=settings)

    @app.exception_handler(EnhancementError)
    async def enhancement_error(request, exc):
        from app.core.body_limit import image_error

        return image_error(exc.status, exc.code, exc.message, request.scope)

    @app.exception_handler(SemanticError)
    async def semantic_error(_request, exc):
        return JSONResponse(
            status_code=exc.status, content={"code": exc.code}, headers={"Retry-After": str(exc.retry_after)}
        )

    @app.exception_handler(RequestValidationError)
    async def invalid_request(_request, _exc):
        # Pydantic error details may echo input. Never return queries/capabilities.
        return JSONResponse(status_code=422, content={"code": "INVALID_REQUEST"})

    @app.exception_handler(Exception)
    async def internal_error(_request, _exc):
        return JSONResponse(status_code=503, content={"code": "SEMANTIC_UNAVAILABLE"})

    async def ready():
        if not settings.SEMANTIC_SEARCH_ENABLED:
            raise SemanticError("SEMANTIC_DISABLED")
        try:
            async with asyncio.timeout(2):
                await app.state.redis.ping()
                if not app.state.ready:
                    await app.state.vectors.ensure_collection()
                    app.state.ready = True
                else:
                    info = await app.state.vectors.client.get_collection(settings.QDRANT_COLLECTION_NAME)
                    params = info.config.params.vectors
                    if (
                        getattr(params, "size", None) != settings.EMBEDDING_DIM
                        or str(getattr(params, "distance", "")) != "Cosine"
                    ):
                        app.state.ready = False
                        raise SemanticError("INDEX_SCHEMA_MISMATCH")
        except SemanticError:
            raise
        except Exception as exc:
            logging.getLogger(__name__).warning(
                "Semantic readiness dependency failure: %s", type(exc).__name__
            )
            app.state.ready = False
            raise SemanticError("INDEX_UNAVAILABLE") from None

    @app.get("/health")
    async def health():
        return {"status": "ok"}

    @app.get("/health/live")
    async def live():
        return {"status": "live"}

    @app.get("/health/ready")
    async def readiness(request: Request):
        actor(request, "health")
        await ready()
        if (
            time.monotonic() - getattr(app.state.provider, "last_success", 0) > 300
            or getattr(app.state.provider, "open_until", 0) > time.monotonic()
        ):
            raise SemanticError("PROVIDER_NOT_VERIFIED")
        return {
            "status": "ready",
            "profileId": settings.EMBEDDING_PROFILE_ID,
            "providerCanary": "recent_success",
        }

    @app.post("/internal/canary")
    async def canary(request: Request):
        actor(request, "health")
        await ready()
        # Explicit authenticated operation; health probes themselves never bill.
        await app.state.provider.canary()
        return {"status": "verified", "profileId": settings.EMBEDDING_PROFILE_ID}

    @app.post("/internal/search")
    async def search(body: SearchRequest, request: Request):
        owner = actor(request, "search")
        async with asyncio.timeout(9):
            await ready()
            await app.state.quota.reserve_search(owner)
            vector = await app.state.provider.embed_query(owner, body.query)
            items = await app.state.vectors.search(owner, vector, body.limit, body)
        return {"items": items, "profileId": settings.EMBEDDING_PROFILE_ID}

    @app.put("/internal/assets/{asset}/{version}")
    async def index(asset: UUID, version: int, request: Request):
        owner = actor(request, f"index:{asset}:{version}")
        if version < 1 or version > 2147483647:
            raise HTTPException(400)
        await ready()
        try:
            encoded = request.headers.get("x-ai-metadata", "")
            if len(encoded) > 2048:
                raise ValueError()
            metadata = IndexMetadata.model_validate_json(
                base64.urlsafe_b64decode(encoded + "=" * ((-len(encoded)) % 4))
            )
        except ValueError:
            raise HTTPException(400, detail="Invalid asset metadata") from None
        if request.headers.get("content-type") != "image/jpeg" or request.headers.get("content-encoding"):
            raise HTTPException(415)
        data = bytearray()
        async with asyncio.timeout(10):
            async for chunk in request.stream():
                if len(data) + len(chunk) > 2 * 1024 * 1024:
                    raise HTTPException(413)
                data.extend(chunk)
        await asyncio.to_thread(check_image, bytes(data))
        vector = await app.state.provider.embed_image(bytes(data))
        payload = metadata.model_dump(mode="json")
        if payload["place"]:
            payload["place"] = payload["place"].lower()
        await app.state.vectors.upsert(owner, str(asset), version, vector, payload)
        return {"status": "ready", "profileId": settings.EMBEDDING_PROFILE_ID}

    @app.delete("/internal/assets/{asset}")
    async def delete(asset: UUID, request: Request):
        owner = actor(request, f"delete:{asset}")
        await ready()
        await app.state.vectors.delete(owner, str(asset))
        return {"status": "deleted"}

    return app


app = create_app()
