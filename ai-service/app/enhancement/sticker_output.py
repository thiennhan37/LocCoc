import asyncio
import io
from array import array

from PIL import Image

from app.enhancement.errors import EnhancementError
from app.enhancement.images import validate_image


def decode(data, limit, pixels):
    validate_image(data, limit=limit, pixels=pixels, output=True)
    with Image.open(io.BytesIO(data)) as image:
        rgba = image.convert("RGBA")
        return bytearray(rgba.tobytes()), rgba.size


def encode(data, size):
    output = io.BytesIO()
    Image.frombytes("RGBA", size, bytes(data)).save(output, "PNG")
    return output.getvalue()


async def create_transparent_sticker(data, *, limit, pixels):
    """Remove only border-connected key green, preserving enclosed subject colors."""
    rgba, (width, height) = await asyncio.to_thread(decode, data, limit, pixels)
    count = width * height

    def is_key(pixel):
        offset = pixel * 4
        r, g, b, a = rgba[offset : offset + 4]
        return a != 0 and g >= 140 and g - r >= 70 and g - b >= 70

    if not all(is_key(pixel) for pixel in (0, width - 1, count - width, count - 1)):
        raise EnhancementError(
            "INVALID_AI_OUTPUT", 422, "Sticker background is not suitable for transparency"
        )
    queue = array("I")

    def visit(pixel):
        if is_key(pixel):
            rgba[pixel * 4 + 3] = 0
            queue.append(pixel)

    for x in range(width):
        visit(x)
        visit(count - width + x)
    for y in range(height):
        visit(y * width)
        visit(y * width + width - 1)
    head = 0
    while head < len(queue):
        if head % 16384 == 0:
            await asyncio.sleep(0)
        pixel = queue[head]
        if pixel % width > 0:
            visit(pixel - 1)
        if pixel % width < width - 1:
            visit(pixel + 1)
        if pixel >= width:
            visit(pixel - width)
        if pixel < count - width:
            visit(pixel + width)
        head += 1
    if len(queue) < count * 0.01 or count - len(queue) < count * 0.01:
        raise EnhancementError(
            "INVALID_AI_OUTPUT", 422, "Sticker must contain a subject and transparent background"
        )
    output = await asyncio.to_thread(encode, rgba, (width, height))
    validate_image(output, limit=limit, pixels=pixels, output=True, sticker=True)
    return output
