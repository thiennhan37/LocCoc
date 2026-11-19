import base64
import binascii

from google import genai
from google.genai import types

from app.enhancement.errors import EnhancementError


class GeminiImageProvider:
    def __init__(self, settings, client=None):
        self.settings = settings
        self.client = (
            client
            or genai.Client(
                api_key=settings.GEMINI_API_KEY.get_secret_value(),
                http_options=types.HttpOptions(
                    timeout=settings.AI_REQUEST_TIMEOUT_MS,
                    retry_options=types.HttpRetryOptions(attempts=1),
                ),
            ).aio
        )

    async def close(self):
        await self.client.aclose()

    async def enhance(self, data, mime, prompt, sticker):
        body = dict(
            model=self.settings.GEMINI_IMAGE_MODEL,
            store=False,
            stream=False,
            response_format={"type": "image", **({"mime_type": "image/jpeg"} if sticker else {})},
            input=[
                {"type": "text", "text": prompt},
                {"type": "image", "data": base64.b64encode(data).decode("ascii"), "mime_type": mime},
            ],
        )
        try:
            result = await self.client.interactions.create(
                **body,
                automatic_continuation=False,
                timeout=self.settings.AI_REQUEST_TIMEOUT_MS / 1000,
            )
        except Exception:
            raise EnhancementError(
                "PROVIDER_FAILURE", 502, "Provider failed to process the request"
            ) from None
        result = result if isinstance(result, dict) else result.model_dump()
        if result.get("status") != "completed" or not isinstance(result.get("steps"), list):
            raise invalid()
        outputs = [
            step for step in result["steps"] if isinstance(step, dict) and step.get("type") == "model_output"
        ]
        if (
            len(outputs) != 1
            or not isinstance(outputs[0].get("content"), list)
            or len(outputs[0]["content"]) != 1
        ):
            raise invalid()
        content = outputs[0]["content"][0]
        if not isinstance(content, dict) or content.get("type") != "image" or content.get("uri"):
            raise invalid()
        encoded = content.get("data")
        if not isinstance(encoded, str) or not encoded or not isinstance(content.get("mime_type"), str):
            raise invalid()
        if len(encoded) > 4 * ((self.settings.AI_MAX_OUTPUT_BYTES + 2) // 3):
            raise EnhancementError(
                "PROVIDER_OUTPUT_TOO_LARGE", 502, "AI image exceeds the configured size limit"
            )
        try:
            data = base64.b64decode(encoded, validate=True)
            if base64.b64encode(data).decode("ascii") != encoded:
                raise ValueError()
        except (ValueError, binascii.Error):
            raise invalid() from None
        return data


def invalid():
    return EnhancementError("INVALID_AI_OUTPUT", 422, "AI did not return a valid image")
