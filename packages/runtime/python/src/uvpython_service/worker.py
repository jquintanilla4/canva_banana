from __future__ import annotations

import math
import time
from threading import Thread
from typing import Literal
from uuid import uuid4

from volcenginesdkarkruntime import Ark
from volcenginesdkarkruntime._exceptions import ArkAPIError, ArkAPIStatusError
from volcenginesdkarkruntime.types.content_generation.content_generation_task_id import ContentGenerationTaskID

from uvpython_service.config import Settings, get_settings, get_tokenhub_settings
from uvpython_service.media import media_to_data_url, upload_video_to_tos, upload_media_to_tos
from uvpython_service.models import (
    MediaInput,
    AssetInput,
    DraftFinalizationPayload,
    SEEDANCE25_STANDARD_MODEL_ID,
    SEEDANCE25_FLASH_MODEL_ID,
    MODEL_LABELS,
    MODEL_RESOLUTIONS,
    JobState,
    SeedanceJobPayload,
    is_seedance25,
    is_tokenhub,
)
from uvpython_service.tokenhub_seedance import TokenHubClient, TokenHubTemporaryError, redact_error, validate_configuration
from uvpython_service.store import job_store
from uvpython_service.ark_references import validate_ark_identifier

SEEDANCE_REFERENCE_IMAGE_LIMIT = 9  # Seedance 2 docs allow up to 9 image refs.
SEEDANCE_REFERENCE_VIDEO_LIMIT = 3  # Seedance 2 docs allow up to 3 video refs.
SEEDANCE_REFERENCE_AUDIO_LIMIT = 3  # Seedance 2 docs allow up to 3 audio refs.
SEEDANCE_REFERENCE_MEDIA_MIN_DURATION_SECONDS = 2.0  # Each reference clip must be at least 2 seconds long.
SEEDANCE_REFERENCE_MEDIA_MAX_DURATION_SECONDS = 15.0  # Each reference clip must be at most 15 seconds long.
SEEDANCE_REFERENCE_VIDEO_TOTAL_DURATION_LIMIT_SECONDS = 15.0  # Reference videos must stay within 15 seconds combined.
SEEDANCE_REFERENCE_AUDIO_TOTAL_DURATION_LIMIT_SECONDS = 15.0  # Reference audios must stay within 15 seconds combined.
SEEDANCE_REFERENCE_DURATION_TOLERANCE_SECONDS = 0.05  # Small tolerance avoids rejecting files due to container rounding noise.
SEEDANCE25_REFERENCE_IMAGE_LIMIT = 30  # Seedance 2.5 docs allow up to 30 image refs.
SEEDANCE25_REFERENCE_VIDEO_LIMIT = 10  # Seedance 2.5 docs allow up to 10 video refs.
SEEDANCE25_REFERENCE_AUDIO_LIMIT = 10  # Seedance 2.5 docs allow up to 10 audio refs.
SEEDANCE25_EDIT_VIDEO_MIN_DURATION_SECONDS = 4.0  # Seedance 2.5 Edit source videos start at 4 seconds.
SEEDANCE25_REFERENCE_MEDIA_MAX_DURATION_SECONDS = 30.0  # Each Seedance 2.5 reference clip must be at most 30 seconds long.
SEEDANCE25_REFERENCE_VIDEO_TOTAL_DURATION_LIMIT_SECONDS = 30.0  # Seedance 2.5 reference videos must stay within 30 seconds combined.
SEEDANCE25_REFERENCE_AUDIO_TOTAL_DURATION_LIMIT_SECONDS = 30.0  # Seedance 2.5 reference audios must stay within 30 seconds combined.

class DraftFinalizationNotSubmitted(Exception):
    pass


class DraftFinalizationUnavailable(Exception):
    def __init__(self, message: str, confirmed_request_id: str | None = None) -> None:
        super().__init__(message)
        self.confirmed_request_id = confirmed_request_id


def _now_ms() -> int:
    return int(time.time() * 1000)  # UI timestamps are milliseconds.


def _log(job_id: str, message: str) -> None:
    job_store.append_log(job_id, message, _now_ms())  # Keep log writes centralized.


def _uses_duration_validation_fallback(media_items: list[MediaInput | AssetInput]) -> bool:
    return any(media.duration_probe_skipped for media in media_items if isinstance(media, MediaInput))


def _validate_reference_media_durations(
    media_items: list[MediaInput | AssetInput],
    *,
    media_kind: Literal["video", "audio"],
    min_clip_duration_seconds: float = SEEDANCE_REFERENCE_MEDIA_MIN_DURATION_SECONDS,
    max_clip_duration_seconds: float = SEEDANCE_REFERENCE_MEDIA_MAX_DURATION_SECONDS,
    total_duration_limit_seconds: float | None = None,
) -> None:
    media_items = [media for media in media_items if isinstance(media, MediaInput)]
    if not media_items:
        return
    if _uses_duration_validation_fallback(media_items):
        return  # The frontend already validates canvas media durations before upload when ffprobe is unavailable.

    if total_duration_limit_seconds is None:
        total_duration_limit_seconds = (
            SEEDANCE_REFERENCE_VIDEO_TOTAL_DURATION_LIMIT_SECONDS
            if media_kind == "video"
            else SEEDANCE_REFERENCE_AUDIO_TOTAL_DURATION_LIMIT_SECONDS
        )  # Seedance uses different combined caps for videos and audios.
    total_duration_seconds = 0.0
    min_duration_seconds = min_clip_duration_seconds - SEEDANCE_REFERENCE_DURATION_TOLERANCE_SECONDS
    max_duration_seconds = max_clip_duration_seconds + SEEDANCE_REFERENCE_DURATION_TOLERANCE_SECONDS
    total_duration_limit_with_tolerance = total_duration_limit_seconds + SEEDANCE_REFERENCE_DURATION_TOLERANCE_SECONDS
    per_clip_label = "videos" if media_kind == "video" else "audio clips"
    singular_label = "video" if media_kind == "video" else "audio clip"

    for media in media_items:
        duration_seconds = media.duration_seconds
        if duration_seconds is None or not math.isfinite(duration_seconds):
            raise ValueError(f"Could not read Seedance 2 reference {singular_label} duration for {media.file_name}")
        if duration_seconds < min_duration_seconds or duration_seconds > max_duration_seconds:
            raise ValueError(
                f"Seedance 2 reference {per_clip_label} must each be between "
                f"{int(min_clip_duration_seconds)} and {int(max_clip_duration_seconds)} seconds"
            )
        total_duration_seconds += duration_seconds

    if total_duration_seconds > total_duration_limit_with_tolerance:
        raise ValueError(
            f"Seedance 2 reference {per_clip_label} must total {int(total_duration_limit_seconds)} seconds or less"
        )


ARK_BASE_URL = "https://ark.cn-beijing.volces.com/api/v3"


def get_client(settings: Settings) -> Ark:
    if not settings.ark_api_key:
        raise ValueError("ARK_API_KEY must be set")  # Ark calls should fail fast on missing auth.
    return Ark(
        base_url=ARK_BASE_URL,
        api_key=settings.ark_api_key,
    )


def _media_url(media: MediaInput, payload: SeedanceJobPayload, settings: Settings) -> str:
    if is_tokenhub(payload.model_id):
        return upload_media_to_tos(media, settings, signed=True)
    return media_to_data_url(media)


def _build_content(job_id: str, payload: SeedanceJobPayload, settings: Settings) -> list[dict[str, object]]:
    content: list[dict[str, object]] = [{"type": "text", "text": payload.prompt}]  # Prompt is always the first content item.

    if payload.variant == "smart":
        if payload.primary_image:
            content.append({
                "type": "image_url",
                "image_url": {"url": _media_url(payload.primary_image, payload, settings)},
                "role": "first_frame",
            })
        if payload.last_frame_image:
            content.append({
                "type": "image_url",
                "image_url": {"url": _media_url(payload.last_frame_image, payload, settings)},
                "role": "last_frame",
            })
        return content

    for reference_image in payload.reference_images:
        content.append({
            "type": "image_url",
            "image_url": {"url": f"asset://{reference_image.asset_id}" if isinstance(reference_image, AssetInput) else _media_url(reference_image, payload, settings)},
            "role": "reference_image",
        })

    for index, reference_video in enumerate(payload.reference_videos, start=1):
        if isinstance(reference_video, AssetInput):
            public_url = f"asset://{reference_video.asset_id}"
        else:
            _log(job_id, f"Uploading reference video {index} to TOS")
            public_url = upload_media_to_tos(reference_video, settings, signed=True) if is_tokenhub(payload.model_id) else upload_video_to_tos(reference_video, settings)
        content.append({
            "type": "video_url",
            "video_url": {"url": public_url},
            "role": "reference_video",
        })

    for reference_audio in payload.reference_audios:
        content.append({
            "type": "audio_url",
            "audio_url": {"url": f"asset://{reference_audio.asset_id}" if isinstance(reference_audio, AssetInput) else _media_url(reference_audio, payload, settings)},
            "role": "reference_audio",
        })

    return content


def _validate_payload(payload: SeedanceJobPayload) -> None:
    tokenhub = is_tokenhub(payload.model_id)
    if tokenhub:
        _validate_tokenhub_options(payload)
    if payload.model_id not in MODEL_LABELS:
        raise ValueError(f"Unsupported Seedance model: {payload.model_id}")  # Keep backend model choices explicit.
    allowed_resolutions = MODEL_RESOLUTIONS.get(payload.model_id, frozenset())
    if payload.resolution is not None and payload.resolution not in allowed_resolutions:
        raise ValueError(f"Resolution {payload.resolution} is not supported by {MODEL_LABELS[payload.model_id]}")
    if not payload.prompt.strip():
        raise ValueError("Prompt is required")  # Every Ark request still needs text.
    if is_seedance25(payload.model_id):
        if payload.duration != -1 and (payload.duration < 4 or payload.duration > 30):
            raise ValueError("Duration must be between 4 and 30 seconds, or -1 for model auto-select")  # Seedance 2.5 duration rules.
    else:
        if payload.duration != -1 and (payload.duration < 4 or payload.duration > 15):
            raise ValueError("Duration must be between 4 and 15 seconds, or -1 for model auto-select")  # Seedance 2.0 series also supports Auto.
        if payload.output_format is not None and not tokenhub:
            raise ValueError("output_format is only supported by Seedance 2.5")

    if payload.priority is not None and (type(payload.priority) is not int or not 0 <= payload.priority <= 9):
        raise ValueError("priority must be an integer between 0 and 9")
    if payload.output_format is not None and payload.output_format not in {"mp4", "mov"}:
        raise ValueError("output_format must be mp4 or mov")
    if payload.draft and (payload.model_id != SEEDANCE25_STANDARD_MODEL_ID or payload.resolution != "480p"):
        raise ValueError("Draft requires standard Seedance 2.5 at 480p")
    for media in (*payload.reference_images, *payload.reference_videos, *payload.reference_audios):
        if isinstance(media, AssetInput):
            validate_ark_identifier(media.asset_id)

    requires_adaptive_ratio = payload.variant in {"edit", "extend"} or (payload.variant == "smart" and payload.primary_image)
    if not tokenhub and is_seedance25(payload.model_id) and requires_adaptive_ratio and payload.ratio != "adaptive":
        raise ValueError("Seedance 2.5 requires an adaptive ratio for first-frame, edit, and extend tasks")
    if not tokenhub and is_seedance25(payload.model_id) and payload.variant == "edit" and payload.duration != -1:
        raise ValueError("Seedance 2.5 edit tasks require duration -1 (model auto-select)")

    if payload.variant == "smart":
        if payload.reference_images or payload.reference_videos or payload.reference_audios:
            raise ValueError("Smart mode does not accept reference sources")
        if payload.last_frame_image and not payload.primary_image:
            raise ValueError("Last-frame mode requires a first-frame image")
        return
    if payload.variant in {"edit", "extend"} and (payload.primary_image or payload.last_frame_image):
        raise ValueError("Edit and Extend modes do not accept first-frame or last-frame images")


    # Caps and duration probing are shared by reference/edit/extend since Ark treats them identically.
    if payload.model_id == SEEDANCE25_FLASH_MODEL_ID:
        image_limit, video_limit, audio_limit = 10, 5, 5
    elif is_seedance25(payload.model_id):
        image_limit = SEEDANCE25_REFERENCE_IMAGE_LIMIT
        video_limit = SEEDANCE25_REFERENCE_VIDEO_LIMIT
        audio_limit = SEEDANCE25_REFERENCE_AUDIO_LIMIT
    else:
        image_limit = SEEDANCE_REFERENCE_IMAGE_LIMIT
        video_limit = SEEDANCE_REFERENCE_VIDEO_LIMIT
        audio_limit = SEEDANCE_REFERENCE_AUDIO_LIMIT
    if len(payload.reference_images) > image_limit:
        raise ValueError(f"Seedance 2 reference supports up to {image_limit} images")
    if len(payload.reference_videos) > video_limit:
        raise ValueError(f"Seedance 2 reference supports up to {video_limit} videos")
    if len(payload.reference_audios) > audio_limit:
        raise ValueError(f"Seedance 2 reference supports up to {audio_limit} audio tracks")

    if payload.variant == "reference":
        if not payload.reference_images and not payload.reference_videos and not payload.reference_audios:
            raise ValueError("Reference mode requires at least one reference asset")
    elif payload.variant == "edit":
        if not payload.reference_videos:
            raise ValueError("Edit mode requires a video to edit")
    else:
        if not payload.reference_videos:
            raise ValueError("Extend mode requires at least one reference video")
        if is_seedance25(payload.model_id):
            if payload.reference_audios:
                raise ValueError("Seedance 2.5 Extend accepts reference videos and images")
        elif payload.reference_images or payload.reference_audios:
            raise ValueError("Extend mode only accepts reference videos")

    if is_seedance25(payload.model_id):
        _validate_reference_media_durations(
            payload.reference_videos,
            media_kind="video",
            min_clip_duration_seconds=SEEDANCE25_EDIT_VIDEO_MIN_DURATION_SECONDS if payload.variant == "edit" else SEEDANCE_REFERENCE_MEDIA_MIN_DURATION_SECONDS,
            max_clip_duration_seconds=SEEDANCE25_REFERENCE_MEDIA_MAX_DURATION_SECONDS,
            total_duration_limit_seconds=SEEDANCE25_REFERENCE_VIDEO_TOTAL_DURATION_LIMIT_SECONDS,
        )
        _validate_reference_media_durations(
            payload.reference_audios,
            media_kind="audio",
            max_clip_duration_seconds=SEEDANCE25_REFERENCE_MEDIA_MAX_DURATION_SECONDS,
            total_duration_limit_seconds=SEEDANCE25_REFERENCE_AUDIO_TOTAL_DURATION_LIMIT_SECONDS,
        )
    else:
        _validate_reference_media_durations(payload.reference_videos, media_kind="video")
        _validate_reference_media_durations(payload.reference_audios, media_kind="audio")


def _validate_tokenhub_options(payload: SeedanceJobPayload) -> None:
    if payload.variant not in {"smart", "reference", "edit", "extend"}:
        raise ValueError("Unsupported TokenHub generation mode")
    if payload.duration == -1 and payload.variant != "edit":
        raise ValueError("TokenHub supports automatic duration only for edit tasks")
    if payload.variant == "edit" and payload.duration != -1:
        raise ValueError("TokenHub edit tasks require duration -1")
    if payload.output_format not in {None, "mp4"}:
        raise ValueError("TokenHub supports MP4 output only")
    if payload.web_search or payload.return_last_frame or payload.watermark or payload.draft or payload.priority is not None or payload.camera_fixed:
        raise ValueError("TokenHub does not support Ark generation settings")
    if payload.jimeng_model_version is not None or payload.session_id or payload.jimeng_mode != "auto" or payload.multiframe_images or payload.transition_prompts or payload.transition_durations:
        raise ValueError("TokenHub does not support Jimeng generation settings")
    if any(isinstance(media, AssetInput) for media in (*payload.reference_images, *payload.reference_videos, *payload.reference_audios)):
        raise ValueError("TokenHub does not support Ark asset references")
    if not is_seedance25(payload.model_id) and payload.reference_audios and not payload.reference_images and not payload.reference_videos:
        raise ValueError("TokenHub Seedance 2 requires an image or video with audio references")


def _create_remote_task(client: Ark | TokenHubClient, payload: SeedanceJobPayload, content: list[dict[str, object]]) -> object:
    if isinstance(client, TokenHubClient):
        return client.create(payload, content)
    request_payload: dict[str, object] = {
        "model": payload.model_id,
        "content": content,
        "ratio": payload.ratio,
        "duration": payload.duration,
        "watermark": payload.watermark,
        "generate_audio": payload.generate_audio,
    }
    if payload.web_search:
        request_payload["tools"] = [{"type": "web_search"}]
    if payload.return_last_frame:
        request_payload["return_last_frame"] = True
    if payload.draft:
        request_payload["draft"] = True
    if payload.priority is not None:
        request_payload["priority"] = payload.priority
    if is_seedance25(payload.model_id):
        if payload.output_format is not None:
            request_payload["output_format"] = payload.output_format
        if payload.variant in {"edit", "extend"}:
            request_payload["omni_reference_task_type"] = payload.variant
    if payload.resolution is not None:
        request_payload["resolution"] = payload.resolution
    return client.post("/contents/generations/tasks", body=request_payload, cast_to=ContentGenerationTaskID)


def _poll_remote_task(job_id: str, client: Ark | TokenHubClient, remote_task_id: str, settings: Settings) -> None:
    tokenhub = isinstance(client, TokenHubClient)
    provider = "TokenHub" if tokenhub else "Volcengine"
    deadline = time.monotonic() + settings.tokenhub_timeout_seconds if tokenhub else None
    last_poll_error: TokenHubTemporaryError | None = None
    last_provider_status: str | None = None
    while True:
        remaining = deadline - time.monotonic() if deadline is not None else None
        if remaining is not None and remaining <= 0:
            if last_poll_error is not None:
                raise RuntimeError(f"TokenHub task timed out while checking status: {last_poll_error}") from None
            raise RuntimeError("TokenHub task timed out")
        try:
            task = client.get(remote_task_id, timeout=min(60, remaining)) if remaining is not None else client.content_generation.tasks.get(task_id=remote_task_id)
            provider_status = getattr(task, "status", "") or "unknown"
            last_poll_error = None
        except TokenHubTemporaryError as exc:
            last_poll_error = exc
            task = None
            provider_status = "waiting to retry status check"
        if deadline is not None and time.monotonic() >= deadline:
            continue
        if provider_status != last_provider_status:
            _log(job_id, f"{provider} status: {provider_status}")
            last_provider_status = provider_status

        if provider_status == "succeeded":
            content_result = getattr(task, "content", None)
            video_url = getattr(content_result, "video_url", None) if content_result else None
            last_frame_url = getattr(content_result, "last_frame_url", None) if content_result else None
            if not video_url:
                raise RuntimeError(f"{provider} completed without a video URL")
            job_store.update(
                job_id,
                status="COMPLETED",
                output_url=video_url,
                last_frame_url=last_frame_url,
                draft_expires_at=_draft_expires_at(task) if getattr(task, "draft", False) is True else None,
                updated_at=_now_ms(),
            )
            _log(job_id, "Video ready")
            return

        if provider_status in {"failed", "expired", "cancelled"}:
            error = getattr(task, "error", None) or f"{provider} task {provider_status}"
            job_store.update(
                job_id,
                status="FAILED",
                error=str(error),
                remote_failure=True,
                updated_at=_now_ms(),
            )
            _log(job_id, f"{provider} task failed")
            return

        interval = settings.tokenhub_poll_interval_seconds if tokenhub else settings.poll_interval_seconds
        time.sleep(min(interval, max(0, deadline - time.monotonic())) if deadline is not None else interval)


def _execute_job(job_id: str, payload: SeedanceJobPayload, settings: Settings | None = None) -> None:
    settings = settings if settings is not None else get_settings()
    provider = "TokenHub" if is_tokenhub(payload.model_id) else "Volcengine"
    try:
        job_store.update(job_id, status="IN_PROGRESS", updated_at=_now_ms())
        _log(job_id, f"Preparing {provider} request")
        if _uses_duration_validation_fallback(payload.reference_videos) or _uses_duration_validation_fallback(payload.reference_audios):
            _log(job_id, "ffprobe unavailable; skipping backend reference duration validation and relying on frontend/provider checks")  # Keep degraded installs debuggable.
        client = TokenHubClient(settings) if is_tokenhub(payload.model_id) else get_client(settings)
        content = _build_content(job_id, payload, settings)
        remote_task = _create_remote_task(client, payload, content)
        remote_task_id = getattr(remote_task, "id", None)
        if not isinstance(remote_task_id, str) or not remote_task_id:
            raise RuntimeError(f"{provider} did not return a task id")

        job_store.update(
            job_id,
            request_id=remote_task_id,
            remote_task_id=remote_task_id,
            updated_at=_now_ms(),
        )
        _log(job_id, f"Task submitted to {provider}")

        _poll_remote_task(job_id, client, remote_task_id, settings)
    except Exception as exc:
        error = redact_error(str(exc), settings) if is_tokenhub(payload.model_id) else str(exc)
        job_store.update(
            job_id,
            status="FAILED",
            error=error,
            updated_at=_now_ms(),
        )
        _log(job_id, f"Worker error: {error}")
    finally:
        payload.cleanup()  # Remove staged uploads once Volcengine has accepted or rejected the job.


def create_job(payload: SeedanceJobPayload) -> JobState:
    _validate_payload(payload)  # Reject invalid jobs before the worker starts and before temp files linger.
    settings = None
    if is_tokenhub(payload.model_id):
        settings = get_tokenhub_settings(get_settings())
        validate_configuration(settings, has_media=bool(payload.iter_media_inputs()))
    job_id = str(uuid4())  # Local queue id shown in the frontend list.
    created_at = _now_ms()
    job = JobState(
        id=job_id,
        model_id=payload.model_id,
        model_label=MODEL_LABELS.get(payload.model_id, "Seedance 2"),
        variant=payload.variant,
        prompt=payload.prompt,
        status="IN_QUEUE",
        created_at=created_at,
        updated_at=created_at,
    )
    job_store.create(job)
    Thread(target=_execute_job, args=(job_id, payload, settings), daemon=True).start()  # Run the poll loop off the request thread.
    return job


def _draft_expires_at(task: object) -> int | None:
    created_at = getattr(task, "created_at", None)
    if type(created_at) not in {int, float} or not math.isfinite(created_at) or created_at <= 0:
        return None
    lifetime_days = 14 if created_at >= 1793152800 else 7
    return int((created_at + lifetime_days * 86400) * 1000)


def _require_finalizable_draft(task: object) -> None:
    if getattr(task, "model", None) != SEEDANCE25_STANDARD_MODEL_ID:
        raise ValueError("Only standard Seedance 2.5 drafts can be finalized")
    if getattr(task, "draft", None) is not True or getattr(task, "status", None) != "succeeded":
        raise ValueError("The original Ark task must be a succeeded draft")
    expires_at = _draft_expires_at(task)
    if expires_at is None:
        raise ValueError("Ark did not return the draft creation time")
    if _now_ms() >= expires_at:
        raise ValueError("The Ark draft has expired")


def _create_draft_finalization_task(client: Ark, payload: DraftFinalizationPayload) -> object:
    validate_ark_identifier(payload.draft_task_id)
    if payload.resolution not in {"1080p", "4k"}:
        raise ValueError("Draft finalization requires 1080p or 4k")
    if payload.output_format is not None and payload.output_format not in {"mp4", "mov"}:
        raise ValueError("outputFormat must be mp4 or mov")
    if payload.priority is not None and (type(payload.priority) is not int or not 0 <= payload.priority <= 9):
        raise ValueError("priority must be an integer between 0 and 9")
    for value in (payload.watermark, payload.return_last_frame):
        if value is not None and type(value) is not bool:
            raise ValueError("Draft finalization flags must be booleans")
    try:
        original = client.content_generation.tasks.get(task_id=payload.draft_task_id)
    except ArkAPIError as exc:
        raise DraftFinalizationNotSubmitted(f"Could not check the Ark draft: {exc}") from exc
    _require_finalizable_draft(original)
    request_payload: dict[str, object] = {
        "model": SEEDANCE25_STANDARD_MODEL_ID,
        "content": [{"type": "draft_task", "draft_task": {"id": payload.draft_task_id}}],
        "resolution": payload.resolution,
    }
    if payload.return_last_frame is not None:
        request_payload["return_last_frame"] = payload.return_last_frame
    if payload.watermark is not None:
        request_payload["watermark"] = payload.watermark
    if payload.output_format is not None:
        request_payload["output_format"] = payload.output_format
    if payload.priority is not None:
        request_payload["priority"] = payload.priority
    return client.post("/contents/generations/tasks", body=request_payload, cast_to=ContentGenerationTaskID, options={"max_retries": 0})


def _execute_remote_poll(job_id: str, client: Ark | TokenHubClient, remote_task_id: str, settings: Settings) -> None:
    try:
        _poll_remote_task(job_id, client, remote_task_id, settings)
    except Exception as exc:
        error = redact_error(str(exc), settings) if isinstance(client, TokenHubClient) else str(exc)
        job_store.update(job_id, status="FAILED", error=error, updated_at=_now_ms())
        _log(job_id, f"Worker error: {error}")


def resume_tokenhub_job(job_id: str) -> JobState | None:
    job = job_store.get(job_id)
    if not job or not is_tokenhub(job.model_id):
        return None
    if job.status != "FAILED" or job.remote_failure or not job.remote_task_id:
        return job

    settings = get_tokenhub_settings(get_settings())
    client = TokenHubClient(settings)
    resumed = job_store.update(
        job_id,
        when=lambda current: current.status == "FAILED" and not current.remote_failure,
        status="IN_PROGRESS",
        error=None,
        updated_at=_now_ms(),
    )
    if not resumed:
        return job_store.get(job_id)
    Thread(target=_execute_remote_poll, args=(job.id, client, job.remote_task_id, settings), daemon=True).start()
    return resumed


def _track_remote_task(client: Ark, task: object, settings: Settings) -> JobState:
    remote_task_id = validate_ark_identifier(getattr(task, "id", None))
    for existing in job_store.list_jobs():
        if existing.remote_task_id == remote_task_id and (existing.status != "FAILED" or existing.remote_failure):
            if existing.status == "COMPLETED" and getattr(task, "status", None) == "succeeded":
                content = getattr(task, "content", None)
                video_url = getattr(content, "video_url", None)
                if video_url:
                    return job_store.update(
                        existing.id,
                        output_url=video_url,
                        last_frame_url=getattr(content, "last_frame_url", None),
                        updated_at=_now_ms(),
                    ) or existing
            return existing
    created_at = _now_ms()
    job = JobState(
        id=str(uuid4()),
        model_id=SEEDANCE25_STANDARD_MODEL_ID,
        model_label=MODEL_LABELS[SEEDANCE25_STANDARD_MODEL_ID],
        variant="smart",
        prompt="Seedance 2.5 draft finalization",
        status="IN_PROGRESS",
        created_at=created_at,
        updated_at=created_at,
        request_id=remote_task_id,
        remote_task_id=remote_task_id,
    )
    job_store.create(job)
    Thread(target=_execute_remote_poll, args=(job.id, client, remote_task_id, settings), daemon=True).start()
    return job


def create_draft_finalization(payload: DraftFinalizationPayload) -> JobState:
    settings = get_settings()
    client = get_client(settings)
    remote_task = _create_draft_finalization_task(client, payload)
    return _track_remote_task(client, remote_task, settings)


def resume_draft_finalization(
    request_id: str,
    *,
    draft_task_id: str | None = None,
    resolution: Literal["1080p", "4k"] | None = None,
) -> JobState:
    validate_ark_identifier(request_id)
    settings = get_settings()
    client = get_client(settings)
    try:
        task = client.content_generation.tasks.get(task_id=request_id)
    except ArkAPIStatusError as exc:
        if exc.status_code not in {404, 410}:
            raise
        raise DraftFinalizationUnavailable("Ark no longer has this final video.") from exc
    if getattr(task, "model", None) != SEEDANCE25_STANDARD_MODEL_ID or getattr(task, "draft", False):
        raise ValueError("Only standard Seedance 2.5 draft finalizations can be resumed")
    original_draft_id = validate_ark_identifier(getattr(task, "draft_task_id", None))
    if getattr(task, "id", None) != request_id:
        raise ValueError("Ark returned a different task ID")
    if draft_task_id is not None or resolution is not None:
        if original_draft_id != validate_ark_identifier(draft_task_id) or getattr(task, "resolution", None) != resolution:
            raise ValueError("The Ark task does not match this draft and resolution")
    if getattr(task, "status", None) == "expired":
        raise DraftFinalizationUnavailable("This Ark final video task has expired.", confirmed_request_id=request_id)
    return _track_remote_task(client, task, settings)


def serialize_job(
    job: JobState,
    *,
    output_url: str | None = None,
    last_frame_url: str | None = None,
) -> dict[str, object]:
    return {
        "id": job.id,
        "modelId": job.model_id,
        "modelLabel": job.model_label,
        "variant": job.variant,
        "prompt": job.prompt,
        "status": job.status,
        "createdAt": job.created_at,
        "updatedAt": job.updated_at,
        "logs": list(job.logs),
        "requestId": job.request_id,
        "remoteTaskId": job.remote_task_id,
        "outputUrl": output_url if output_url is not None else (None if is_tokenhub(job.model_id) else job.output_url),
        "providerOutputUrl": None if is_tokenhub(job.model_id) else job.output_url,
        "lastFrameUrl": last_frame_url if last_frame_url is not None else job.last_frame_url,
        "providerLastFrameUrl": job.last_frame_url,
        "error": job.error,
        "draftExpiresAt": job.draft_expires_at,
        "remoteFailure": job.remote_failure,
        "provider": "volcengine",
    }  # Return proxyable asset URLs without discarding the raw provider URLs used for debugging.
