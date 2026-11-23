from __future__ import annotations

import json
import re
from dataclasses import dataclass
from http.client import IncompleteRead
from urllib.error import HTTPError, URLError
from urllib.parse import urlsplit
from urllib.request import HTTPRedirectHandler, Request, build_opener

from uvpython_service.ark_references import validate_ark_identifier
from uvpython_service.config import Settings
from uvpython_service.models import SeedanceJobPayload, is_seedance25

_RETRYABLE_HTTP_STATUS = {408, 429, 500, 502, 503, 504}
_RESPONSE_BYTES_LIMIT = 2 * 1024 * 1024


class TokenHubTemporaryError(RuntimeError):
    pass


class _NoRedirectHandler(HTTPRedirectHandler):
    def redirect_request(self, req: Request, fp: object, code: int, msg: str, headers: object, newurl: str) -> None:
        return None


@dataclass(frozen=True)
class TokenHubContent:
    video_url: str


@dataclass(frozen=True)
class TokenHubTask:
    id: str
    status: str = "unknown"
    content: TokenHubContent | None = None
    error: str | None = None


def redact_error(message: str, settings: Settings) -> str:
    for secret in (settings.tokenhub_api_key, settings.volcengine_access_key, settings.volcengine_secret_key):
        if secret:
            message = message.replace(secret, "[redacted]")
    return re.sub(r"https?://[^\s\"'<>]+", "[redacted URL]", message)[:1000]


def _validate_task_id(value: object) -> str:
    try:
        return validate_ark_identifier(value)
    except ValueError:
        raise RuntimeError("TokenHub did not return a valid task id") from None


def validate_output_url(value: object) -> str:
    if not isinstance(value, str) or len(value) > 32768 or any(ord(char) < 33 for char in value) or "\\" in value:
        raise RuntimeError("TokenHub completed without a valid signed video URL")
    try:
        parsed = urlsplit(value)
        valid = parsed.scheme == "https" and parsed.hostname and not parsed.username and not parsed.password and not parsed.fragment and parsed.port in {None, 443}
    except ValueError:
        valid = False
    if not valid:
        raise RuntimeError("TokenHub completed without a valid signed video URL")
    return value


def validate_configuration(settings: Settings, *, has_media: bool) -> str:
    if not settings.tokenhub_api_key:
        raise ValueError("TOKENHUB_API_KEY must be set")
    base_url = settings.tokenhub_base_url.rstrip("/")
    try:
        parsed = urlsplit(base_url)
        valid = (parsed.scheme == "https" and parsed.hostname and not parsed.username and not parsed.password
                 and not parsed.query and not parsed.fragment and "\\" not in base_url
                 and all(ord(char) >= 33 for char in base_url))
        parsed.port
    except ValueError:
        valid = False
    if not valid:
        raise ValueError("TOKENHUB_BASE_URL must be an HTTPS API base URL")
    if has_media and (not settings.volcengine_access_key or not settings.volcengine_secret_key):
        raise ValueError("VOLCENGINE_ACCESS_KEY and VOLCENGINE_SECRET_KEY must be set for TokenHub media uploads")
    return base_url if parsed.path else f"{base_url}/v1"


def build_request(payload: SeedanceJobPayload, content: list[dict[str, object]]) -> dict[str, object]:
    metadata: dict[str, object] = {"generate_audio": payload.generate_audio}
    if payload.resolution is not None:
        metadata["resolution"] = payload.resolution
    adaptive = is_seedance25(payload.model_id) and (payload.variant in {"edit", "extend"} or (payload.variant == "smart" and payload.primary_image is not None))
    if not adaptive:
        metadata["ratio"] = payload.ratio
    body: dict[str, object] = {"model": payload.model_id, "prompt": payload.prompt, "metadata": metadata}
    if payload.variant == "edit":
        metadata["duration"] = -1
    else:
        body["seconds"] = str(payload.duration)
    media_content = [item for item in content if item.get("type") != "text"]
    if payload.variant == "smart" and payload.primary_image is not None and payload.last_frame_image is None:
        image_url = media_content[0]["image_url"]
        if not isinstance(image_url, dict) or not isinstance(image_url.get("url"), str):
            raise ValueError("TokenHub requires a first-frame URL")
        body["images"] = [image_url["url"]]
    elif media_content:
        metadata["content"] = media_content
    return body


class TokenHubClient:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self.base_url = validate_configuration(settings, has_media=False)

    def _request(self, path: str, body: dict[str, object] | None = None, *, timeout: float = 60) -> dict[str, object]:
        request = Request(
            f"{self.base_url}{path}",
            data=json.dumps(body).encode("utf-8") if body is not None else None,
            headers={
                "Authorization": f"Bearer {self.settings.tokenhub_api_key}",
                "Content-Type": "application/json",
                "Accept": "application/json",
                "User-Agent": "Canva-Banana-Seedance",
            },
            method="POST" if body is not None else "GET",
        )
        try:
            with build_opener(_NoRedirectHandler).open(request, timeout=timeout) as response:
                raw = response.read(_RESPONSE_BYTES_LIMIT + 1)
                pending_bytes = getattr(response, "length", None)
                if len(raw) <= _RESPONSE_BYTES_LIMIT and isinstance(pending_bytes, int) and pending_bytes > 0:
                    raise TokenHubTemporaryError("TokenHub response ended before its declared length")
        except HTTPError as exc:
            detail = ""
            try:
                error_body = exc.read(65537)
                error_payload = json.loads(error_body) if len(error_body) <= 65536 else None
                error = error_payload.get("error") if isinstance(error_payload, dict) else None
                message = error.get("message") if isinstance(error, dict) else None
                if isinstance(message, str):
                    detail = f": {redact_error(message, self.settings)}"
            except (ValueError, UnicodeError, OSError, IncompleteRead):
                pass
            finally:
                exc.close()
            error_type = TokenHubTemporaryError if exc.code in _RETRYABLE_HTTP_STATUS else RuntimeError
            raise error_type(f"TokenHub request failed with HTTP {exc.code}{detail}") from None
        except (URLError, OSError, IncompleteRead):
            raise TokenHubTemporaryError("TokenHub request failed") from None
        if len(raw) > _RESPONSE_BYTES_LIMIT:
            raise RuntimeError("TokenHub response exceeded the metadata size limit")
        try:
            result = json.loads(raw)
        except (ValueError, UnicodeError):
            raise RuntimeError("TokenHub returned invalid JSON") from None
        if not isinstance(result, dict):
            raise RuntimeError("TokenHub returned an invalid response")
        return result

    def create(self, payload: SeedanceJobPayload, content: list[dict[str, object]]) -> TokenHubTask:
        response = self._request("/videos", build_request(payload, content))
        task_id = _validate_task_id(response.get("id") or response.get("task_id"))
        return TokenHubTask(id=task_id)

    def get(self, task_id: str, *, timeout: float = 60) -> TokenHubTask:
        response = self._request(f"/videos/{_validate_task_id(task_id)}", timeout=timeout)
        status = response.get("status")
        if not isinstance(status, str):
            raise RuntimeError("TokenHub returned an invalid task status")
        if status in {"unknown", "queued", "in_progress"}:
            return TokenHubTask(id=task_id, status=status)
        if status == "completed":
            metadata = response.get("metadata")
            url = metadata.get("url") if isinstance(metadata, dict) else None
            return TokenHubTask(id=task_id, status="succeeded", content=TokenHubContent(validate_output_url(url)))
        if status == "failed":
            error = response.get("error")
            message = error.get("message") if isinstance(error, dict) else None
            message = redact_error(message, self.settings) if isinstance(message, str) else "TokenHub task failed"
            return TokenHubTask(id=task_id, status="failed", error=message)
        raise RuntimeError("TokenHub returned an invalid task status")
