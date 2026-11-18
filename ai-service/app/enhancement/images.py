import io
import warnings

from PIL import Image

from app.enhancement.errors import EnhancementError

MIMES = {"JPEG": "image/jpeg", "PNG": "image/png", "WEBP": "image/webp"}


def validate_image(data, *, limit, declared=None, sticker=False, output=False, pixels=40_000_000):
    if len(data) > limit:
        raise EnhancementError(
            "PROVIDER_OUTPUT_TOO_LARGE" if output else "PAYLOAD_TOO_LARGE",
            502 if output else 413,
            "Image exceeds the configured size limit",
        )
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            with Image.open(io.BytesIO(data)) as image:
                mime = MIMES.get(image.format)
                if not mime or (declared is not None and declared != mime):
                    raise ValueError()
                if image.width * image.height > pixels or getattr(image, "n_frames", 1) != 1:
                    raise ValueError()
                image.verify()
            with Image.open(io.BytesIO(data)) as image:
                image.load()  # Full decode catches signature-valid truncated provider output.
                if sticker and (
                    mime != "image/png" or image.convert("RGBA").getchannel("A").getextrema()[0] == 255
                ):
                    raise ValueError()
        return mime
    except Exception:
        raise EnhancementError(
            "INVALID_AI_OUTPUT" if output else "UNSUPPORTED_MEDIA_TYPE",
            422 if output else 415,
            "AI did not return a valid image"
            if output
            else "Only valid JPEG, PNG and WebP images are supported",
        ) from None
