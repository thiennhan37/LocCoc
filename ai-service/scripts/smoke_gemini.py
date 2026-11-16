"""Explicit live smoke: exactly two calls, synthetic image only, no vector/key logs.

Run from ai-service only with explicit authorization:
.venv/Scripts/python scripts/smoke_gemini.py --live
Not a retrieval quality benchmark and not a production acceptance gate.
"""

import asyncio
import io
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from PIL import Image, ImageDraw
from app.core.config import Settings
from app.core.errors import SemanticError
from app.services.gemini_service import GeminiService


class TwoCallQuota:
    def __init__(self):
        self.calls = 0

    async def reserve(self, _operation):
        if self.calls >= 2:
            raise SemanticError("SMOKE_CALL_CAP")
        self.calls += 1


async def main():
    settings = Settings(PROVIDER_TIMEOUT_SECONDS=10)
    if not settings.GEMINI_EMBEDDING_API_KEY.get_secret_value().strip():
        print("NOT RUN: configure GEMINI_EMBEDDING_API_KEY in ai-service/.env")
        return 2
    provider = GeminiService(settings, TwoCallQuota())
    try:
        image = Image.new("RGB", (256, 256), "white")
        ImageDraw.Draw(image).rectangle((40, 40, 216, 216), fill="red")
        data = io.BytesIO()
        image.save(data, "JPEG")
        picture = await provider.embed_image(data.getvalue())
        query = await provider.embed_query("synthetic-smoke", "một hình vuông màu đỏ trên nền trắng")
        print(f"PASS: two Gemini API calls; image/text vectors valid ({len(query)} dimensions).")
        print(
            f"Synthetic-pair cosine: {sum(a * b for a, b in zip(picture, query)):.4f}; quality gate NOT VERIFIED."
        )
        return 0
    except SemanticError as error:
        print(f"FAIL: {error.code}; no retry performed")
        return 1
    finally:
        await provider.close()


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser()
    parser.add_argument("--live", action="store_true", help="Explicitly authorize two live provider calls")
    if not parser.parse_args().live:
        print("NOT RUN: live smoke requires --live and GEMINI_EMBEDDING_API_KEY; no API call made")
        raise SystemExit(2)
    raise SystemExit(asyncio.run(main()))
