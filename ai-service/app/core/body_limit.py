import hmac

from starlette.responses import JSONResponse


class BodyLimit:
    """Authenticate before parsing and bound chunked as well as declared bodies."""

    def __init__(self, app, settings):
        self.app = app
        self.settings = settings

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http" or scope["path"] == "/health/live":
            return await self.app(scope, receive, send)
        headers = dict(scope.get("headers", []))
        expected = self.settings.AI_SERVICE_TOKEN.get_secret_value().encode()
        if len(expected) < 32 or not hmac.compare_digest(expected, headers.get(b"x-service-token", b"")):
            return await JSONResponse({"code": "UNAUTHORIZED"}, status_code=401)(scope, receive, send)
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
