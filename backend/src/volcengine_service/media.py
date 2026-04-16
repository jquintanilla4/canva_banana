from __future__ import annotations

import base64
import mimetypes
from datetime import datetime
from pathlib import Path
from uuid import uuid4

import warnings

with warnings.catch_warnings():
    warnings.simplefilter("ignore", SyntaxWarning)
    import tos

from volcengine_service.config import Settings
from volcengine_service.models import MediaInput


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
