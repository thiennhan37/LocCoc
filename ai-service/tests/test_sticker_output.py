import asyncio
import io

import pytest
from PIL import Image, ImageDraw

from app.enhancement.errors import EnhancementError
from app.enhancement.sticker_output import create_transparent_sticker


def fixture(size=64, color=(0, 255, 0), subject=True):
    image = Image.new("RGB", (size, size), color)
    if subject:
        draw = ImageDraw.Draw(image)
        draw.rectangle((size // 4, size // 4, size * 3 // 4 - 1, size * 3 // 4 - 1), fill="white")
        draw.rectangle((size * 3 // 8, size * 3 // 8, size * 5 // 8 - 1, size * 5 // 8 - 1), fill=(0, 255, 0))
    output = io.BytesIO()
    image.save(output, "JPEG", quality=90, subsampling=0)
    return output.getvalue()


async def test_removes_border_key_preserving_outline_and_enclosed_green():
    output = await create_transparent_sticker(fixture(), limit=100000, pixels=4096)
    with Image.open(io.BytesIO(output)) as image:
        assert image.format == "PNG"
        assert image.getpixel((0, 0))[3] == 0
        assert image.getpixel((18, 18))[3] == 255
        assert image.getpixel((32, 32))[3] == 255


async def test_succeeds_even_when_subject_touches_corners():
    img = Image.new("RGB", (64, 64), (0, 255, 0))
    draw = ImageDraw.Draw(img)
    # Subject touches bottom-left and bottom-right corners (common in close-up/portrait photos)
    draw.rectangle((0, 24, 63, 63), fill="white")
    draw.rectangle((6, 30, 57, 63), fill=(40, 50, 70))
    buf = io.BytesIO()
    img.save(buf, "JPEG", quality=90)
    output = await create_transparent_sticker(buf.getvalue(), limit=100000, pixels=4096)
    with Image.open(io.BytesIO(output)) as sticker:
        assert sticker.format == "PNG"
        assert sticker.getpixel((32, 0))[3] == 0
        assert sticker.getpixel((32, 48))[3] == 255


@pytest.mark.parametrize("data", [b"broken", fixture(subject=False), fixture(color="white", subject=False)])
async def test_rejects_corrupt_or_missing_key_or_subject(data):
    with pytest.raises(EnhancementError, match="INVALID_AI_OUTPUT"):
        await create_transparent_sticker(data, limit=100000, pixels=4096)


async def test_bounds_pixels_and_encoded_output():
    with pytest.raises(EnhancementError, match="INVALID_AI_OUTPUT"):
        await create_transparent_sticker(fixture(), limit=100000, pixels=4095)
    with pytest.raises(EnhancementError, match="PROVIDER_OUTPUT_TOO_LARGE"):
        await create_transparent_sticker(fixture(), limit=10, pixels=4096)


async def test_processing_yields_and_can_be_cancelled():
    work = asyncio.create_task(create_transparent_sticker(fixture(1024), limit=1000000, pixels=1048576))
    await asyncio.sleep(0.02)
    work.cancel()
    with pytest.raises(asyncio.CancelledError):
        await work
