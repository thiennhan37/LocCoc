import hashlib
import hmac
from uuid import UUID

import jwt
from fastapi import HTTPException, Request


def actor(request: Request, operation: str) -> str:
    settings = request.app.state.settings
    expected = settings.AI_SERVICE_TOKEN.get_secret_value()
    supplied = request.headers.get("x-service-token", "")
    if len(expected) < 32 or not hmac.compare_digest(expected, supplied):
        raise HTTPException(401, detail="Authentication required")
    try:
        token = request.headers.get("x-ai-actor", "")
        if len(token) > 2048:
            raise ValueError("Token too long")
        claims = jwt.decode(
            token,
            settings.AI_ACTOR_SECRET.get_secret_value(),
            algorithms=["HS256"],
            audience="loccoc-ai",
            issuer="moment-service",
            options={"require": ["sub", "exp", "iat", "jti", "aud", "iss", "op"]},
        )
        if claims["op"] != operation or claims["exp"] - claims["iat"] > 60:
            raise ValueError("Wrong scope")
        return str(UUID(claims["sub"]))
    except (jwt.PyJWTError, ValueError, TypeError, KeyError):
        raise HTTPException(401, detail="Invalid actor capability") from None


def cache_key(secret: str, owner: str, profile: str, query: str) -> str:
    return hmac.new(secret.encode(), f"{owner}\0{profile}\0{query}".encode(), hashlib.sha256).hexdigest()
