import hmac
import asyncio
import re
from uuid import uuid4

from starlette.responses import JSONResponse


def image_error(status, code, message, scope):
    request_id = scope.get("state", {}).get("request_id", str(uuid4()))
    return JSONResponse(
        {"statusCode": status, "error": code, "code": code, "message": message, "requestId": request_id},
        status_code=status, headers={"Cache-Control": "no-store", "x-request-id": request_id,
                                    **({"Retry-After": "30"} if status == 429 else {})},
    )


class BodyLimit:
    """Authenticate before parsing and bound chunked as well as declared bodies."""

    def __init__(self, app, settings):
        self.app = app
        self.settings = settings

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http" or scope["path"] in ("/health/live", "/health"):
            return await self.app(scope, receive, send)
        headers = dict(scope.get("headers", []))
        enhancement = scope["path"] == "/ai/images/enhance"
        if enhancement:
            request_id = headers.get(b"x-request-id", b"").decode("ascii", errors="ignore")
            scope.setdefault("state", {})["request_id"] = request_id if re.fullmatch(r"[a-zA-Z0-9_-]{1,100}", request_id) else str(uuid4())
        expected = self.settings.AI_SERVICE_TOKEN.get_secret_value().encode()
        if len(expected) < 32 or not hmac.compare_digest(expected, headers.get(b"x-service-token", b"")):
            response = image_error(401, "UNAUTHORIZED", "Authentication required", scope) if enhancement else JSONResponse({"code": "UNAUTHORIZED"}, status_code=401)
            return await response(scope, receive, send)
        if enhancement:
            return await self.enhance(scope, receive, send, headers)
        limit = 2 * 1024 * 1024 if scope["path"].startswith("/internal/assets/") else 8192
        try:
            declared = int(headers.get(b"content-length", b"0"))
        except ValueError:
            declared = limit + 1
        if declared < 0 or declared > limit:
            return await JSONResponse({"code": "REQUEST_TOO_LARGE"}, status_code=413)(scope, receive, send)
        size = 0

        async def bounded_receive():
            nonlocal size
            message = await receive()
            size += len(message.get("body", b""))
            if size > limit:
                from fastapi import HTTPException

                raise HTTPException(413, detail="Request too large")
            return message

        return await self.app(scope, bounded_receive, send)

    async def enhance(self, scope, receive, send, headers):
        limit = self.settings.AI_MAX_INPUT_BYTES + 65536  # Bounded multipart overhead.
        try:
            declared = int(headers.get(b"content-length", b"0"))
        except ValueError:
            declared = limit + 1
        if declared < 0 or declared > limit:
            return await image_error(413, "PAYLOAD_TOO_LARGE", "Request body too large", scope)(scope, receive, send)
        size = 0
        started = False

        async def bounded_receive():
            nonlocal size
            message = await receive()
            size += len(message.get("body", b""))
            if size > limit:
                from starlette.formparsers import MultiPartException
                raise MultiPartException("Request body too large")
            return message

        async def safe_send(message):
            nonlocal started
            if message["type"] == "http.response.start":
                started = True
                names = {b"cache-control", b"x-request-id", b"x-content-type-options"}
                message["headers"] = [(k,v) for k,v in message.get("headers", []) if k.lower() not in names] + [
                    (b"cache-control", b"no-store"), (b"x-request-id", scope["state"]["request_id"].encode()),
                    (b"x-content-type-options", b"nosniff"),
                ]
            await send(message)

        try:
            async with asyncio.timeout(self.settings.AI_REQUEST_TIMEOUT_MS / 1000):
                await self.app(scope, bounded_receive, safe_send)
        except TimeoutError:
            if not started:
                await image_error(504, "TIMEOUT", "Image request timed out", scope)(scope, receive, safe_send)
        except Exception:
            if not started:
                await image_error(502, "PROVIDER_FAILURE", "Image processing unavailable", scope)(scope, receive, safe_send)
