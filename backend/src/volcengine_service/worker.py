from __future__ import annotations

import math
import time
from threading import Thread
from typing import Literal
from uuid import uuid4

from volcenginesdkarkruntime import Ark

from volcengine_service.config import Settings, get_settings
from volcengine_service.media import media_to_data_url, upload_video_to_tos
from volcengine_service.models import (
    MediaInput,
    MODEL_LABELS,
    JobState,
    SeedanceJobPayload,
)
from volcengine_service.store import job_store

SEEDANCE_REFERENCE_IMAGE_LIMIT = 9  # Seedance 2 docs allow up to 9 image refs.
SEEDANCE_REFERENCE_VIDEO_LIMIT = 3  # Seedance 2 docs allow up to 3 video refs.
SEEDANCE_REFERENCE_AUDIO_LIMIT = 3  # Seedance 2 docs allow up to 3 audio refs.
SEEDANCE_REFERENCE_MEDIA_MIN_DURATION_SECONDS = 2.0  # Each reference clip must be at least 2 seconds long.
SEEDANCE_REFERENCE_MEDIA_MAX_DURATION_SECONDS = 15.0  # Each reference clip must be at most 15 seconds long.
SEEDANCE_REFERENCE_VIDEO_TOTAL_DURATION_LIMIT_SECONDS = 15.0  # Reference videos must stay within 15 seconds combined.
SEEDANCE_REFERENCE_AUDIO_TOTAL_DURATION_LIMIT_SECONDS = 15.0  # Reference audios must stay within 15 seconds combined.
SEEDANCE_REFERENCE_DURATION_TOLERANCE_SECONDS = 0.05  # Small tolerance avoids rejecting files due to container rounding noise.


def _now_ms() -> int:
    return int(time.time() * 1000)  # UI timestamps are milliseconds.


def _log(job_id: str, message: str) -> None:
    job_store.append_log(job_id, message, _now_ms())  # Keep log writes centralized.


def _uses_duration_validation_fallback(media_items: list[MediaInput]) -> bool:
    return any(media.duration_probe_skipped for media in media_items)  # Missing ffprobe should relax backend validation instead of blocking uploads.


def _validate_reference_media_durations(
    media_items: list[MediaInput],
    *,
    media_kind: Literal["video", "audio"],
) -> None:
    if not media_items:
        return
    if _uses_duration_validation_fallback(media_items):
        return  # The frontend already validates canvas media durations before upload when ffprobe is unavailable.

    total_duration_limit_seconds = (
        SEEDANCE_REFERENCE_VIDEO_TOTAL_DURATION_LIMIT_SECONDS
        if media_kind == "video"
        else SEEDANCE_REFERENCE_AUDIO_TOTAL_DURATION_LIMIT_SECONDS
    )  # Seedance uses different combined caps for videos and audios.
    total_duration_seconds = 0.0
    min_duration_seconds = SEEDANCE_REFERENCE_MEDIA_MIN_DURATION_SECONDS - SEEDANCE_REFERENCE_DURATION_TOLERANCE_SECONDS
    max_duration_seconds = SEEDANCE_REFERENCE_MEDIA_MAX_DURATION_SECONDS + SEEDANCE_REFERENCE_DURATION_TOLERANCE_SECONDS
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
                f"{int(SEEDANCE_REFERENCE_MEDIA_MIN_DURATION_SECONDS)} and {int(SEEDANCE_REFERENCE_MEDIA_MAX_DURATION_SECONDS)} seconds"
            )
        total_duration_seconds += duration_seconds

    if total_duration_seconds > total_duration_limit_with_tolerance:
        raise ValueError(
            f"Seedance 2 reference {per_clip_label} must total {int(total_duration_limit_seconds)} seconds or less"
        )


def get_client(settings: Settings) -> Ark:
    if not settings.ark_api_key:
        raise ValueError("ARK_API_KEY must be set")  # Ark calls should fail fast on missing auth.
    return Ark(
        base_url="https://ark.cn-beijing.volces.com/api/v3",
        api_key=settings.ark_api_key,
    )


def _build_content(job_id: str, payload: SeedanceJobPayload, settings: Settings) -> list[dict[str, object]]:
    content: list[dict[str, object]] = [{"type": "text", "text": payload.prompt}]  # Prompt is always the first content item.

    if payload.variant == "smart":
        if payload.primary_image:
            content.append({
                "type": "image_url",
                "image_url": {"url": media_to_data_url(payload.primary_image)},
                "role": "first_frame",
            })
        if payload.last_frame_image:
            content.append({
                "type": "image_url",
                "image_url": {"url": media_to_data_url(payload.last_frame_image)},
                "role": "last_frame",
            })
        return content

    for reference_image in payload.reference_images:
        content.append({
            "type": "image_url",
            "image_url": {"url": media_to_data_url(reference_image)},
            "role": "reference_image",
        })

    for index, reference_video in enumerate(payload.reference_videos, start=1):
        _log(job_id, f"Uploading reference video {index} to TOS")  # Surface upload progress in the queue panel.
        public_url = upload_video_to_tos(reference_video, settings)
        content.append({
            "type": "video_url",
            "video_url": {"url": public_url},
            "role": "reference_video",
        })

    for reference_audio in payload.reference_audios:
        content.append({
            "type": "audio_url",
            "audio_url": {"url": media_to_data_url(reference_audio)},
        })

    return content


def _validate_payload(payload: SeedanceJobPayload) -> None:
    if payload.model_id not in MODEL_LABELS:
        raise ValueError(f"Unsupported Seedance model: {payload.model_id}")  # Keep backend model choices explicit.
    if not payload.prompt.strip():
        raise ValueError("Prompt is required")  # Every Ark request still needs text.
    if payload.duration < 4 or payload.duration > 15:
        raise ValueError("Duration must be between 4 and 15 seconds")  # Match Seedance limits from the source repo.

    if payload.variant == "smart":
        if payload.last_frame_image and not payload.primary_image:
            raise ValueError("Last-frame mode requires a first-frame image")
        return

    if len(payload.reference_images) > SEEDANCE_REFERENCE_IMAGE_LIMIT:
        raise ValueError(f"Seedance 2 reference supports up to {SEEDANCE_REFERENCE_IMAGE_LIMIT} images")
    if len(payload.reference_videos) > SEEDANCE_REFERENCE_VIDEO_LIMIT:
        raise ValueError(f"Seedance 2 reference supports up to {SEEDANCE_REFERENCE_VIDEO_LIMIT} videos")
    if len(payload.reference_audios) > SEEDANCE_REFERENCE_AUDIO_LIMIT:
        raise ValueError(f"Seedance 2 reference supports up to {SEEDANCE_REFERENCE_AUDIO_LIMIT} audio tracks")
    if not payload.reference_images and not payload.reference_videos and not payload.reference_audios:
        raise ValueError("Reference mode requires at least one reference asset")
    _validate_reference_media_durations(payload.reference_videos, media_kind="video")
    _validate_reference_media_durations(payload.reference_audios, media_kind="audio")


def _create_remote_task(client: Ark, payload: SeedanceJobPayload, content: list[dict[str, object]]) -> object:
    request_payload: dict[str, object] = {
        "model": payload.model_id,
        "content": content,
        "ratio": payload.ratio,
        "duration": payload.duration,
        "watermark": False,
        "generate_audio": payload.generate_audio,
        "camera_fixed": payload.camera_fixed,
    }
    if payload.resolution is not None:
        request_payload["resolution"] = payload.resolution
    return client.content_generation.tasks.create(**request_payload)


def _execute_job(job_id: str, payload: SeedanceJobPayload) -> None:
    settings = get_settings()  # Read env once per worker.
    try:
        job_store.update(job_id, status="IN_PROGRESS", updated_at=_now_ms())
        _log(job_id, "Preparing Volcengine request")
        if _uses_duration_validation_fallback(payload.reference_videos) or _uses_duration_validation_fallback(payload.reference_audios):
            _log(job_id, "ffprobe unavailable; skipping backend reference duration validation and relying on frontend/provider checks")  # Keep degraded installs debuggable.
        client = get_client(settings)
        content = _build_content(job_id, payload, settings)
        remote_task = _create_remote_task(client, payload, content)
        remote_task_id = getattr(remote_task, "id", None)
        if not isinstance(remote_task_id, str) or not remote_task_id:
            raise RuntimeError("Volcengine did not return a task id")

        job_store.update(
            job_id,
            request_id=remote_task_id,
            remote_task_id=remote_task_id,
            updated_at=_now_ms(),
        )
        _log(job_id, "Task submitted to Volcengine")

        last_provider_status: str | None = None
        while True:
            task = client.content_generation.tasks.get(task_id=remote_task_id)
            provider_status = getattr(task, "status", "") or "unknown"
            if provider_status != last_provider_status:
                _log(job_id, f"Volcengine status: {provider_status}")
                last_provider_status = provider_status

            if provider_status == "succeeded":
                content_result = getattr(task, "content", None)
                video_url = getattr(content_result, "video_url", None) if content_result else None
                last_frame_url = getattr(content_result, "last_frame_url", None) if content_result else None
                if not video_url:
                    raise RuntimeError("Volcengine completed without a video URL")
                job_store.update(
                    job_id,
                    status="COMPLETED",
                    output_url=video_url,
                    last_frame_url=last_frame_url,
                    updated_at=_now_ms(),
                )
                _log(job_id, "Video ready")
                return

            if provider_status == "failed":
                error = getattr(task, "error", None) or "Volcengine task failed"
                job_store.update(
                    job_id,
                    status="FAILED",
                    error=str(error),
                    updated_at=_now_ms(),
                )
                _log(job_id, "Volcengine task failed")
                return

            time.sleep(settings.poll_interval_seconds)  # Poll until the provider finishes.
    except Exception as exc:
        job_store.update(
            job_id,
            status="FAILED",
            error=str(exc),
            updated_at=_now_ms(),
        )
        _log(job_id, f"Worker error: {exc}")
    finally:
        payload.cleanup()  # Remove staged uploads once Volcengine has accepted or rejected the job.


def create_job(payload: SeedanceJobPayload) -> JobState:
    _validate_payload(payload)  # Reject invalid jobs before the worker starts and before temp files linger.
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
    Thread(target=_execute_job, args=(job_id, payload), daemon=True).start()  # Run the poll loop off the request thread.
    return job


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
        "outputUrl": output_url if output_url is not None else job.output_url,
        "providerOutputUrl": job.output_url,
        "lastFrameUrl": last_frame_url if last_frame_url is not None else job.last_frame_url,
        "providerLastFrameUrl": job.last_frame_url,
        "error": job.error,
        "provider": "volcengine",
    }  # Return proxyable asset URLs without discarding the raw provider URLs used for debugging.
