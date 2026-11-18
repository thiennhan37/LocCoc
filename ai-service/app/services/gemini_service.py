import asyncio
import math
import logging
import time
from collections import OrderedDict

from google import genai
from google.genai import errors, types

from app.core.errors import SemanticError
from app.core.security import cache_key
from app.services.query_translator import QueryTranslator


def validate_vector(values, dimension: int = 768) -> list[float]:
    if not isinstance(values, (tuple, list)) or len(values) != dimension:
        raise SemanticError("INVALID_EMBEDDING")
    if any(isinstance(x, bool) or not isinstance(x, (int, float)) or not math.isfinite(x) for x in values):
        raise SemanticError("INVALID_EMBEDDING")
    norm = math.sqrt(sum(x * x for x in values))
    if norm < 0.95 or norm > 1.05:
        raise SemanticError("INVALID_EMBEDDING")
    return [float(x) / norm for x in values]


class GeminiService:
    def __init__(self, settings, quota, client=None):
        self.settings = settings
        self.quota = quota
        if client is None and not settings.GEMINI_EMBEDDING_API_KEY.get_secret_value().strip():
            # Never let the SDK fall back to GEMINI_API_KEY/GOOGLE_API_KEY.
            raise SemanticError("PROVIDER_CONFIGURATION_ERROR")
        self.client = (
            client
            or genai.Client(
                api_key=settings.GEMINI_EMBEDDING_API_KEY.get_secret_value(),
                http_options=types.HttpOptions(
                    timeout=int(settings.PROVIDER_TIMEOUT_SECONDS * 1000),
                    retry_options=types.HttpRetryOptions(attempts=1),
                ),
            ).aio
        )
        self.cache = OrderedDict()
        self.slots = asyncio.Semaphore(8)
        self.translator = QueryTranslator(settings, quota, self.client, self.slots)
        self.query_cache = OrderedDict()
        self.query_locks = [asyncio.Lock() for _ in range(32)]
        self.failures = 0
        self.open_until = 0.0
        self.last_success = 0.0

    async def close(self):
        await self.client.aclose()

    async def embed_query(self, owner: str, query: str):
        request_key = cache_key(
            self.settings.AI_ACTOR_SECRET.get_secret_value(),
            owner,
            f"{self.settings.EMBEDDING_PROFILE_ID}:query-routing-v2:{self.settings.QUERY_TRANSLATION_ENABLED}:{self.settings.GEMINI_QUERY_TRANSLATION_MODEL}",
            query,
        )
        async with self.query_locks[int.from_bytes(request_key.encode()[:8], "big") % len(self.query_locks)]:
            cached = self.query_cache.get(request_key)
            if cached and cached[0] > time.monotonic():
                self.query_cache.move_to_end(request_key)
                return cached[1]
            vector, fallback = await self._query_vector(owner, query)
            self.query_cache[request_key] = (time.monotonic() + (30 if fallback else 900), vector)
            self.query_cache.move_to_end(request_key)
            while len(self.query_cache) > 512:
                self.query_cache.popitem(last=False)
            return vector

    async def _query_vector(self, owner: str, query: str):
        fallback = False
        if self.settings.QUERY_TRANSLATION_ENABLED:
            try:
                query = await self.translator.to_english(owner, query)
            except (TimeoutError, SemanticError) as error:
                if isinstance(error, SemanticError) and error.code in (
                    "PROVIDER_QUOTA_EXHAUSTED",
                    "QUOTA_UNAVAILABLE",
                    "OWNER_RATE_LIMITED",
                ):
                    raise
                fallback = True
                logging.getLogger(__name__).warning(
                    "Translation unavailable; embedding original query (%s)",
                    error.code if isinstance(error, SemanticError) else "QUERY_TRANSLATION_TIMEOUT",
                )
        formatted = f"task: search result | query: {query}"
        key = cache_key(
            self.settings.AI_ACTOR_SECRET.get_secret_value(),
            owner,
            f"{self.settings.EMBEDDING_PROFILE_ID}:{self.translator.VERSION if self.settings.QUERY_TRANSLATION_ENABLED else 'raw'}",
            formatted,
        )
        cached = self.cache.get(key)
        if cached and cached[0] > time.monotonic():
            self.cache.move_to_end(key)
            return cached[1], fallback
        vector = await self._embed("query", types.Content(parts=[types.Part.from_text(text=formatted)]))
        self.cache[key] = (time.monotonic() + 900, vector)
        self.cache.move_to_end(key)
        while len(self.cache) > 512:
            self.cache.popitem(last=False)
        return vector, fallback

    async def embed_image(self, image: bytes):
        return await self._embed(
            "ingest", types.Content(parts=[types.Part.from_bytes(data=image, mime_type="image/jpeg")])
        )

    async def canary(self):
        # Bypass the user cache so an explicit canary verifies the live provider.
        return await self._embed(
            "query", types.Content(parts=[types.Part.from_text(text="LocCoc embedding health canary")])
        )

    async def _embed(self, operation: str, contents):
        if time.monotonic() < self.open_until:
            raise SemanticError("PROVIDER_UNAVAILABLE")
        try:
            async with asyncio.timeout(self.settings.PROVIDER_TIMEOUT_SECONDS):
                async with self.slots:
                    await self.quota.reserve(operation)
                    result = await self.client.models.embed_content(
                        model=self.settings.GEMINI_EMBEDDING_MODEL,
                        contents=contents,
                        config=types.EmbedContentConfig(output_dimensionality=self.settings.EMBEDDING_DIM),
                    )
                    if not result.embeddings or len(result.embeddings) != 1:
                        raise SemanticError("INVALID_EMBEDDING")
                    vector = validate_vector(result.embeddings[0].values, self.settings.EMBEDDING_DIM)
                    self.failures = 0
                    self.last_success = time.monotonic()
                    return vector
        except SemanticError:
            raise
        except TimeoutError:
            code = "PROVIDER_TIMEOUT"
        except errors.APIError as exc:
            code = (
                "PROVIDER_RATE_LIMITED"
                if exc.code == 429
                else "PROVIDER_CONFIGURATION_ERROR"
                if exc.code in (400, 401, 403, 404)
                else "PROVIDER_UNAVAILABLE"
            )
            if exc.code == 429:
                raw = getattr(getattr(exc, "response", None), "headers", {}).get("retry-after", "30")
                try:
                    retry_after = int(raw)
                except (ValueError, TypeError):
                    retry_after = 30
                raise SemanticError(code, 429, retry_after) from None
        except Exception:
            code = "PROVIDER_UNAVAILABLE"
        self.failures += 1
        if self.failures >= 3 or code == "PROVIDER_CONFIGURATION_ERROR":
            self.open_until = time.monotonic() + 30
        raise SemanticError(code) from None
