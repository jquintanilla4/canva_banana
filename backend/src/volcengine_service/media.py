from __future__ import annotations

import base64
import importlib
import json
import math
import mimetypes
import os
import shutil
import subprocess
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Literal
from uuid import uuid4

import warnings

with warnings.catch_warnings():
    warnings.simplefilter("ignore", SyntaxWarning)
    import tos

from volcengine_service.config import Settings
from volcengine_service.models import MediaInput

@dataclass(frozen=True)
class FfprobeStatus:
    available: bool
    path: str | None
    source: Literal["env", "system", "bundled", "missing"]
    warning: str | None = None


def _resolve_explicit_ffprobe_path(raw_path: str) -> str | None:
    expanded_path = str(Path(raw_path).expanduser())  # Let callers pass either a full path or a PATH lookup name.
    return shutil.which(expanded_path)  # Only accept overrides that resolve to an executable binary.


def _resolve_bundled_ffprobe_path() -> str | None:
    try:
        ffprobe_binaries = importlib.import_module("ffprobe_binaries")
    except ImportError:
        return None  # Older environments can still rely on a system ffprobe or the graceful fallback path.

    get_ffprobe_path = getattr(ffprobe_binaries, "get_ffprobe_path", None)
    if not callable(get_ffprobe_path):
        return None  # Treat unexpected package layouts the same as an unavailable bundled binary.

    try:
        bundled_ffprobe_path = get_ffprobe_path()
    except Exception:  # pragma: no cover - Third-party binary discovery should not crash the service.
        return None
    return str(bundled_ffprobe_path) if bundled_ffprobe_path else None


def get_ffprobe_status() -> FfprobeStatus:
    explicit_ffprobe_path = os.environ.get("VOLCENGINE_FFPROBE_PATH", "").strip() or os.environ.get("FFPROBE_PATH", "").strip()
    invalid_explicit_warning: str | None = None
    if explicit_ffprobe_path:
        resolved_explicit_path = _resolve_explicit_ffprobe_path(explicit_ffprobe_path)
        if resolved_explicit_path:
            return FfprobeStatus(available=True, path=resolved_explicit_path, source="env")  # Explicit overrides keep local installs debuggable.
        invalid_explicit_warning = (
            f"Configured ffprobe override is not executable: {explicit_ffprobe_path}. "
            "Falling back to system or bundled ffprobe discovery."
        )

    system_ffprobe_path = shutil.which("ffprobe")
    if system_ffprobe_path:
        return FfprobeStatus(
            available=True,
            path=system_ffprobe_path,
            source="system",
            warning=invalid_explicit_warning,
        )  # Prefer the machine-wide binary when it already exists.

    bundled_ffprobe_path = _resolve_bundled_ffprobe_path()
    if bundled_ffprobe_path:
        return FfprobeStatus(
            available=True,
            path=bundled_ffprobe_path,
            source="bundled",
            warning=invalid_explicit_warning,
        )  # Fresh backend installs can use the bundled fallback.

    return FfprobeStatus(
        available=False,
        path=None,
        source="missing",
        warning=invalid_explicit_warning or "ffprobe is unavailable; rerun `uv sync --project backend`, set `VOLCENGINE_FFPROBE_PATH`, or install ffmpeg system-wide.",
    )


def probe_media_duration_seconds(path: Path) -> float | None:
    ffprobe_status = get_ffprobe_status()
    if not ffprobe_status.available or not ffprobe_status.path:
        return None  # Older installs can fall back to frontend/provider validation when ffprobe is missing.

    try:
        result = subprocess.run(
            [
                ffprobe_status.path,
                "-v",
                "error",
                "-show_entries",
                "format=duration:stream=codec_type,duration",
                "-of",
                "json",
                str(path),
            ],
            capture_output=True,
            text=True,
            check=False,
        )  # Probe the staged upload directly from disk so validation matches the actual submitted file.
    except OSError:
        return None  # Treat missing or non-executable binaries the same as an unavailable ffprobe.
    if result.returncode != 0:
        return None  # Invalid media should fail validation with a clear upload error.

    try:
        payload = json.loads(result.stdout or "{}")
    except json.JSONDecodeError:
        return None  # Treat malformed ffprobe output the same as unreadable media.

    duration_candidates: list[float] = []
    format_duration = payload.get("format", {}).get("duration")
    if format_duration is not None:
        try:
            parsed_duration = float(format_duration)
        except (TypeError, ValueError):
            parsed_duration = math.nan
        if math.isfinite(parsed_duration) and parsed_duration >= 0:
            duration_candidates.append(parsed_duration)

    for stream in payload.get("streams", []):
        stream_duration = stream.get("duration")
        if stream_duration is None:
            continue
        try:
            parsed_duration = float(stream_duration)
        except (TypeError, ValueError):
            continue
        if math.isfinite(parsed_duration) and parsed_duration >= 0:
            duration_candidates.append(parsed_duration)

    return max(duration_candidates) if duration_candidates else None  # Use the longest reported duration when containers expose both stream and format values.


def media_to_data_url(media: MediaInput) -> str:
    mime_type = media.content_type.strip() or mimetypes.guess_type(media.file_name)[0] or "application/octet-stream"  # Preserve upload mime when possible.
    encoded = base64.b64encode(media.read_bytes()).decode("utf-8")  # Read staged uploads on demand instead of keeping raw bytes in memory.
    return f"data:{mime_type};base64,{encoded}"


def upload_video_to_tos(media: MediaInput, settings: Settings) -> str:
    if not settings.volcengine_access_key or not settings.volcengine_secret_key:
        raise ValueError("VOLCENGINE_ACCESS_KEY and VOLCENGINE_SECRET_KEY must be set")  # TOS uploads require credentials.

    endpoint = f"tos-{settings.tos_region}.volces.com"  # Region-specific TOS endpoint.
    client = tos.TosClientV2(
        settings.volcengine_access_key,
        settings.volcengine_secret_key,
        endpoint,
        settings.tos_region,
    )
    suffix = Path(media.file_name).suffix or ".mp4"  # Keep the original video extension.
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S_%f")  # Include microseconds so same-second uploads do not collide.
    object_key = f"seedance_refs/{timestamp}_{uuid4().hex}_{Path(media.file_name).stem}{suffix}"  # Keep each reference asset on its own object key.
    client.put_object_from_file(
        settings.tos_bucket_name,
        object_key,
        str(media.temp_path),
        acl=tos.ACLType.ACL_Public_Read,
    )  # Upload the staged file directly instead of rewriting it to another temp file.

    return f"https://{settings.tos_bucket_name}.{endpoint}/{object_key}"
