"""Isolated integration fixture: real HTTP/Qdrant/Redis, deterministic provider.
Never import from production. Does not make Gemini calls.
"""

import io
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from PIL import Image, ImageStat
from app.core.config import Settings
from app.core.errors import SemanticError
from app.main import create_app


class FixtureProvider:
    async def close(self):
        pass

    async def embed_query(self, _owner, query):
        if "outage" in query:
            raise SemanticError("PROVIDER_UNAVAILABLE")
        return [0.0, 1.0] + [0.0] * 766 if "xanh" in query else [1.0] + [0.0] * 767

    async def embed_image(self, data):
        mean = ImageStat.Stat(Image.open(io.BytesIO(data))).mean
        return [1.0] + [0.0] * 767 if mean[0] > mean[2] else [0.0, 1.0] + [0.0] * 766


class FixtureImageProvider:
    async def close(self):
        pass

    async def enhance(self, data, mime, prompt, sticker):
        output = io.BytesIO()
        image = Image.open(io.BytesIO(data)).convert("RGBA")
        if sticker:
            image.putalpha(128)
        image.save(output, "PNG")
        return output.getvalue()


app = create_app(Settings(), provider=FixtureProvider(), image_provider=FixtureImageProvider())
