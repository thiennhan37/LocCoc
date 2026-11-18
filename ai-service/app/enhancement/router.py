import asyncio
from contextlib import suppress

from fastapi import APIRouter, Request
from starlette.datastructures import UploadFile
from starlette.exceptions import HTTPException
from starlette.requests import ClientDisconnect
from starlette.responses import Response

from app.enhancement.errors import EnhancementError
from app.enhancement.prompts import PROMPTS

router = APIRouter()


async def disconnected(request):
    while True:
        if await request.is_disconnected():
            return
        await asyncio.sleep(0.05)


@router.post("/ai/images/enhance")
async def enhance(request: Request):
    settings = request.app.state.settings
    if not settings.IMAGE_ENHANCEMENT_ENABLED:
        raise EnhancementError("ENHANCEMENT_DISABLED", 503, "Image enhancement is disabled")
    if request.headers.get("content-encoding") or not request.headers.get(
        "content-type", ""
    ).lower().startswith("multipart/form-data;"):
        raise EnhancementError("INVALID_REQUEST", 400, "Use multipart image and filterId")
    try:
        async with request.form(max_files=1, max_fields=1, max_part_size=1024) as form:
            if sorted(form.keys()) != ["filterId", "image"] or len(form.multi_items()) != 2:
                raise EnhancementError("INVALID_REQUEST", 400, "Use exactly image and filterId")
            image, filter_id = form["image"], form["filterId"]
            if (
                not isinstance(image, UploadFile)
                or not isinstance(filter_id, str)
                or filter_id not in PROMPTS
            ):
                raise EnhancementError("INVALID_REQUEST", 400, "Invalid image or filterId")
            data = await image.read(settings.AI_MAX_INPUT_BYTES + 1)
            work = asyncio.create_task(
                request.app.state.enhancement.enhance(
                    data,
                    image.content_type,
                    filter_id,
                    request.state.request_id,
                )
            )
            disconnect = asyncio.create_task(disconnected(request))
            try:
                done, _ = await asyncio.wait({work, disconnect}, return_when=asyncio.FIRST_COMPLETED)
                if work not in done:
                    raise EnhancementError("CANCELLED", 499, "Cancelled")
                output, mime = await work
                return Response(
                    output,
                    media_type=mime,
                    headers={"Cache-Control": "no-store", "X-Content-Type-Options": "nosniff"},
                )
            finally:
                for task in (work, disconnect):
                    task.cancel()
                for task in (work, disconnect):
                    with suppress(asyncio.CancelledError):
                        await task
    except ClientDisconnect:
        raise EnhancementError("CANCELLED", 499, "Cancelled") from None
    except HTTPException as exc:
        if exc.status_code == 413 or exc.detail == "Request body too large":
            raise EnhancementError("PAYLOAD_TOO_LARGE", 413, "Request body too large") from None
        raise EnhancementError("INVALID_REQUEST", 400, "Invalid multipart image request") from None
