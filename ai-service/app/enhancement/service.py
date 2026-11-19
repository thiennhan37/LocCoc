import asyncio
import json
import logging
import time

from app.enhancement.errors import EnhancementError
from app.enhancement.images import validate_image
from app.enhancement.prompts import PROMPTS
from app.enhancement.sticker_output import create_transparent_sticker

LOG = logging.getLogger("loccoc.enhancement")


class EnhancementService:
    def __init__(self, settings, provider, quota):
        self.settings, self.provider, self.quota = settings, provider, quota
        self.slots = asyncio.Semaphore(4)

    async def enhance(self, data, mime, filter_id, request_id):
        started = time.monotonic()
        outcome = "SUCCESS"
        try:
            if filter_id not in PROMPTS:
                raise EnhancementError("INVALID_REQUEST", 400, "Unsupported image filter")
            await asyncio.to_thread(
                validate_image,
                data,
                limit=self.settings.AI_MAX_INPUT_BYTES,
                declared=mime,
                pixels=self.settings.AI_MAX_IMAGE_PIXELS,
            )
            async with self.slots:
                await self.quota.reserve_enhancement()
                output = await self.provider.enhance(
                    data, mime, PROMPTS[filter_id], filter_id == "subject_sticker"
                )
                if filter_id == "subject_sticker":
                    output = await create_transparent_sticker(
                        output,
                        limit=self.settings.AI_MAX_OUTPUT_BYTES,
                        pixels=self.settings.AI_MAX_IMAGE_PIXELS,
                    )
            result_mime = await asyncio.to_thread(
                validate_image,
                output,
                limit=self.settings.AI_MAX_OUTPUT_BYTES,
                output=True,
                sticker=filter_id == "subject_sticker",
                pixels=self.settings.AI_MAX_IMAGE_PIXELS,
            )
            return output, result_mime
        except asyncio.CancelledError:
            outcome = "CANCELLED"
            raise
        except EnhancementError as exc:
            outcome = exc.code
            raise
        except Exception:
            outcome = "PROVIDER_FAILURE"
            raise EnhancementError(
                "PROVIDER_FAILURE", 502, "Provider failed to process the request"
            ) from None
        finally:
            LOG.info(
                json.dumps(
                    {
                        "requestId": request_id,
                        "filterId": filter_id if filter_id in PROMPTS else None,
                        "durationMs": int((time.monotonic() - started) * 1000),
                        "outcome": outcome,
                    }
                )
            )
