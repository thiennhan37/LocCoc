import asyncio
import io
import logging
from array import array

from PIL import Image

from app.enhancement.errors import EnhancementError
from app.enhancement.images import validate_image

LOG = logging.getLogger("loccoc.enhancement.sticker")


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
    """Convert provider sticker image into RGBA PNG by removing border-connected key background."""
    rgba, (width, height) = await asyncio.to_thread(decode, data, limit, pixels)
    count = width * height

    # Fast check: if provider already returned genuine transparency with a valid subject, keep it.
    transparent_count = sum(1 for i in range(3, count * 4, 4) if rgba[i] < 16)
    opaque_count = count - transparent_count
    if transparent_count >= count * 0.01 and opaque_count >= count * 0.01:
        output = await asyncio.to_thread(encode, rgba, (width, height))
        validate_image(output, limit=limit, pixels=pixels, output=True, sticker=True)
        return output

    visited = bytearray(count)
    queue = array("I")

    def is_key(pixel):
        offset = pixel * 4
        a = rgba[offset + 3]
        if a == 0:
            return False
        r = rgba[offset]
        g = rgba[offset + 1]
        b = rgba[offset + 2]
        top_rb = r if r > b else b
        return g >= 85 and (g - top_rb) >= 30 and g * 5 > top_rb * 6

    def visit(pixel):
        if visited[pixel]:
            return
        if is_key(pixel):
            visited[pixel] = 1
            rgba[pixel * 4 + 3] = 0
            queue.append(pixel)

    # Seed flood-fill from all 4 borders so subjects touching 1-3 corners still succeed.
    for x in range(width):
        visit(x)
        visit(count - width + x)
    for y in range(height):
        visit(y * width)
        visit(y * width + width - 1)

    perimeter = max(1, 2 * width + 2 * height - 4)
    if len(queue) < max(4, int(perimeter * 0.05)):
        LOG.warning(
            "Sticker border key pixels insufficient: borderKey=%d perimeter=%d size=%dx%d",
            len(queue),
            perimeter,
            width,
            height,
        )
        raise EnhancementError(
            "INVALID_AI_OUTPUT", 422, "Sticker background is not suitable for transparency"
        )

    head = 0
    while head < len(queue):
        if head % 16384 == 0:
            await asyncio.sleep(0)
        pixel = queue[head]
        x = pixel % width
        if x > 0:
            visit(pixel - 1)
        if x < width - 1:
            visit(pixel + 1)
        if pixel >= width:
            visit(pixel - width)
        if pixel < count - width:
            visit(pixel + width)
        head += 1

    removed = len(queue)
    if removed < count * 0.01 or count - removed < count * 0.01:
        LOG.warning("Sticker foreground/background ratio invalid: removed=%d total=%d", removed, count)
        raise EnhancementError(
            "INVALID_AI_OUTPUT", 422, "Sticker must contain a subject and transparent background"
        )

    # Despill 1px outer boundary neighbors to eliminate neon-green JPEG chroma subsampling fringe.
    for idx in range(removed):
        if idx % 32768 == 0:
            await asyncio.sleep(0)
        pixel = queue[idx]
        x = pixel % width
        neighbors = []
        if x > 0:
            neighbors.append(pixel - 1)
        if x < width - 1:
            neighbors.append(pixel + 1)
        if pixel >= width:
            neighbors.append(pixel - width)
        if pixel < count - width:
            neighbors.append(pixel + width)
        for nb in neighbors:
            if visited[nb]:
                continue
            off = nb * 4
            if rgba[off + 3] == 0:
                continue
            r, g, b = rgba[off], rgba[off + 1], rgba[off + 2]
            top_rb = r if r > b else b
            if g > top_rb + 12:
                rgba[off + 1] = top_rb

    output = await asyncio.to_thread(encode, rgba, (width, height))
    validate_image(output, limit=limit, pixels=pixels, output=True, sticker=True)
    return output
