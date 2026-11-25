from __future__ import annotations

import asyncio
import base64
import json
import re
from collections.abc import AsyncGenerator, Iterator
from dataclasses import dataclass
from typing import BinaryIO

import httpx
from starlette.concurrency import run_in_threadpool
from starlette.datastructures import FormData, UploadFile
from starlette.formparsers import FormParser, MultiPartException, MultiPartParser
from starlette.requests import Request

from uvpython_service.config import get_settings
from uvpython_service.worker import ARK_BASE_URL

SEEDREAM55_MODEL_ID = "doubao-seedream-5-5-261028"
SEEDREAM55_MAX_IMAGE_BYTES = 30_000_000
SEEDREAM55_MAX_IMAGES = 10
SEEDREAM55_MAX_FIELDS = 6
SEEDREAM55_MAX_FIELD_BYTES = 1024 * 1024
SEEDREAM55_MAX_FORM_BYTES = SEEDREAM55_MAX_IMAGES * SEEDREAM55_MAX_IMAGE_BYTES + SEEDREAM55_MAX_FIELDS * SEEDREAM55_MAX_FIELD_BYTES + 65536
SEEDREAM55_UPLOAD_IDLE_SECONDS = 60
IMAGE_READ_BYTES = 3 * 65536


class ImageGenerationUpstreamError(RuntimeError):
    def __init__(self, status_code: int, code: str | None = None) -> None:
        self.status_code = status_code
        detail = f", code {code}" if code else ""
        super().__init__(f"Ark image generation failed (HTTP {status_code}{detail})")


class _ImageMultiPartParser(MultiPartParser):
    async def parse(self) -> FormData:
        self._finished = False
        try:
            form = await super().parse()
            if not self._finished:
                raise MultiPartException("Incomplete image form")
            return form
        except BaseException:
            for file in self._files_to_close_on_error:
                file.close()
            raise

    def on_end(self) -> None:
        self._finished = True

    def on_part_begin(self) -> None:
        super().on_part_begin()
        self._image_bytes = 0
        self._header_bytes = 0

    def on_part_data(self, data: bytes, start: int, end: int) -> None:
        if self._current_part.file is not None:
            self._image_bytes += end - start
            if self._image_bytes > SEEDREAM55_MAX_IMAGE_BYTES:
                raise MultiPartException("Each image must be 30,000,000 bytes or smaller")
        super().on_part_data(data, start, end)

    def on_header_field(self, data: bytes, start: int, end: int) -> None:
        self._check_header_bytes(end - start)
        super().on_header_field(data, start, end)

    def on_header_value(self, data: bytes, start: int, end: int) -> None:
        self._check_header_bytes(end - start)
        super().on_header_value(data, start, end)

    def _check_header_bytes(self, count: int) -> None:
        self._header_bytes += count
        if self._header_bytes > 16384:
            raise MultiPartException("Image form headers are too large")


async def read_image_form(request: Request) -> FormData:
    multipart = request.headers.get("content-type", "").split(";", 1)[0].strip().lower() == "multipart/form-data"
    limit = SEEDREAM55_MAX_FORM_BYTES if multipart else SEEDREAM55_MAX_FIELDS * SEEDREAM55_MAX_FIELD_BYTES + 65536

    async def bounded_stream() -> AsyncGenerator[bytes, None]:
        received = 0
        source = request.stream()
        while True:
            async with asyncio.timeout(SEEDREAM55_UPLOAD_IDLE_SECONDS):
                chunk = await anext(source, b"")
            if not chunk:
                break
            received += len(chunk)
            if received > limit:
                raise MultiPartException("Image form is too large")
            for offset in range(0, len(chunk), 65536):
                yield chunk[offset:offset + 65536]
        yield b""

    if multipart:
        parser = _ImageMultiPartParser(
            request.headers, bounded_stream(), max_files=SEEDREAM55_MAX_IMAGES,
            max_fields=SEEDREAM55_MAX_FIELDS, max_part_size=SEEDREAM55_MAX_FIELD_BYTES,
        )
    else:
        parser = FormParser(
            request.headers, bounded_stream(), max_fields=SEEDREAM55_MAX_FIELDS,
            max_part_size=SEEDREAM55_MAX_FIELD_BYTES,
        )
    try:
        return await parser.parse()
    except MultiPartException as exc:
        raise ValueError(exc.message) from exc


@dataclass(frozen=True)
class ImageGenerationOptions:
    operation: str
    prompt: str
    size: str
    output_format: str
    background: str


@dataclass(frozen=True)
class StagedImage:
    file: BinaryIO
    size: int
    content_type: str


def validate_image_options(
    operation: str,
    prompt: str,
    size: str | None,
    output_format: str,
    background: str,
    image_count: int,
) -> ImageGenerationOptions:
    if operation not in {"text_to_image", "image_edit", "layerize"}:
        raise ValueError("Unsupported image operation")
    if output_format not in {"png", "jpeg"}:
        raise ValueError("output_format must be png or jpeg")
    if background not in {"auto", "transparent", "opaque"}:
        raise ValueError("background must be auto, transparent, or opaque")
    if operation != "layerize" and output_format == "jpeg" and background == "transparent":
        raise ValueError("Transparent backgrounds require PNG output")
    resolved_size = size if size is not None else ("auto" if operation == "layerize" else "2K")
    allowed_sizes = {"auto"} if operation == "layerize" else {"1K", "1.5K", "2K"}
    if resolved_size not in allowed_sizes:
        raise ValueError("Layerize size must be auto" if operation == "layerize" else "size must be 1K, 1.5K, or 2K")
    if operation == "text_to_image" and image_count != 0:
        raise ValueError("text_to_image does not accept images")
    if operation == "image_edit" and not 1 <= image_count <= SEEDREAM55_MAX_IMAGES:
        raise ValueError("image_edit requires between 1 and 10 images")
    if operation == "layerize" and image_count != 1:
        raise ValueError("layerize requires exactly one JPEG or PNG image")
    return ImageGenerationOptions(operation, prompt, resolved_size, output_format, background)


async def read_image_uploads(uploads: list[UploadFile], *, layerize: bool) -> list[StagedImage]:
    images: list[StagedImage] = []
    for upload in uploads:
        await upload.seek(0)
        size = upload.size
        if size is None:
            size = await run_in_threadpool(upload.file.seek, 0, 2)
            await upload.seek(0)
        if size > SEEDREAM55_MAX_IMAGE_BYTES:
            raise ValueError("Each image must be 30,000,000 bytes or smaller")
        if size == 0:
            raise ValueError("Images must not be empty")
        signature = await upload.read(12)
        content_type = (upload.content_type or "").lower().split(";", 1)[0].strip()
        if signature.startswith(b"\x89PNG\r\n\x1a\n"):
            content_type = "image/png"
        elif signature.startswith(b"\xff\xd8\xff"):
            content_type = "image/jpeg"
        elif layerize:
            raise ValueError("layerize requires a JPEG or PNG image")
        if not content_type.startswith("image/"):
            raise ValueError("Uploaded references must be images")
        images.append(StagedImage(upload.file, size, content_type))
    return images


class ImageRequestBody:
    def __init__(self, options: ImageGenerationOptions, images: list[StagedImage]) -> None:
        body: dict[str, object] = {
            "model": SEEDREAM55_MODEL_ID,
            "prompt": options.prompt,
            "size": options.size,
            "output_format": options.output_format,
            "response_format": "b64_json",
            "watermark": False,
        }
        body.update({"layer_decomposition": True} if options.operation == "layerize" else {"background": options.background})
        self.images = images
        self.prefix = json.dumps(body).encode("utf-8")
        self.suffix = b""
        self.image_prefixes = [json.dumps(f"data:{image.content_type};base64,").encode("utf-8")[:-1] for image in images]
        if images:
            self.prefix = self.prefix[:-1] + (b', "image": ' if options.operation == "layerize" else b', "image": [')
            self.suffix = b"}" if options.operation == "layerize" else b"]}"
        self.content_length = len(self.prefix) + len(self.suffix) + sum(len(prefix) + 4 * ((image.size + 2) // 3) + 1 for prefix, image in zip(self.image_prefixes, images)) + max(0, len(images) - 1)

    def __iter__(self) -> Iterator[bytes]:
        yield self.prefix
        for index, (prefix, image) in enumerate(zip(self.image_prefixes, self.images)):
            if index:
                yield b","
            yield prefix
            image.file.seek(0)
            while chunk := image.file.read(IMAGE_READ_BYTES):
                yield base64.b64encode(chunk)
            yield b'"'
        yield self.suffix


def generate_images(options: ImageGenerationOptions, images: list[StagedImage]) -> dict[str, object]:
    settings = get_settings()
    if not settings.ark_api_key:
        raise ValueError("ARK_API_KEY must be set")
    body = ImageRequestBody(options, images)
    try:
        with httpx.Client(timeout=httpx.Timeout(600.0, connect=60.0)) as client:
            response = client.post(
                f"{ARK_BASE_URL}/images/generations",
                content=body,
                headers={"Authorization": f"Bearer {settings.ark_api_key}", "Content-Type": "application/json", "Content-Length": str(body.content_length)},
            )
    except (httpx.HTTPError, UnicodeError) as exc:
        raise RuntimeError("Could not complete the Ark image request") from exc
    if not response.is_success:
        code = None
        try:
            error = response.json().get("error")
            candidate = error.get("code") if isinstance(error, dict) else None
            if isinstance(candidate, str) and re.fullmatch(r"[A-Za-z][A-Za-z0-9._-]{0,127}", candidate) and settings.ark_api_key not in candidate:
                code = candidate
        except (ValueError, AttributeError):
            pass
        raise ImageGenerationUpstreamError(response.status_code, code)
    try:
        result = response.json()
    except ValueError as exc:
        raise RuntimeError("Ark returned an invalid image response") from exc
    if not isinstance(result, dict) or result.get("error"):
        raise RuntimeError("Ark image generation failed")
    entries = result.get("data")
    if not isinstance(entries, list) or not entries:
        raise RuntimeError("Ark returned no generated images")
    data: list[dict[str, object]] = []
    for entry in entries:
        if not isinstance(entry, dict) or not isinstance(entry.get("b64_json"), str) or not entry["b64_json"]:
            raise RuntimeError("Ark returned an image without base64 data")
        output_format = "png" if options.operation == "layerize" and entry.get("z_index") != 0 else options.output_format
        item = {"b64_json": entry["b64_json"], "output_format": output_format}
        for field in ("z_index", "bounding_box", "name"):
            if entry.get(field) is not None:
                item[field] = entry[field]
        data.append(item)
    payload: dict[str, object] = {"data": data}
    request_id = response.headers.get("X-Request-Id") or result.get("request_id")
    if isinstance(request_id, str) and request_id:
        payload["requestId"] = request_id
    return payload
