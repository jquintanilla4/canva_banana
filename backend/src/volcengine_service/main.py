from __future__ import annotations

import tempfile
from pathlib import Path

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware

from volcengine_service.media import get_ffprobe_status, probe_media_duration_seconds
from volcengine_service.models import DEFAULT_MODEL_ID, MediaInput, SeedanceJobPayload
from volcengine_service.store import job_store
from volcengine_service.worker import create_job, serialize_job

app = FastAPI(title="Canva Banana Volcengine Service")  # Local dev API surface.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Keep local frontend iteration simple.
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


async def _read_upload(
    upload: UploadFile | None,
    *,
    should_probe_duration: bool = False,
    media_label: str = "upload",
) -> MediaInput | None:
    if upload is None:
        return None
    suffix = Path(upload.filename or "upload.bin").suffix  # Preserve original extensions when possible.
    size_bytes = 0
    tmp_path: Path | None = None
    try:
        await upload.seek(0)  # Always stage from the beginning of the uploaded stream.
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp_file:
            tmp_path = Path(tmp_file.name)  # Store uploads on disk so requests do not hold them in memory.
            while chunk := await upload.read(1024 * 1024):
                tmp_file.write(chunk)
                size_bytes += len(chunk)
        if size_bytes == 0:
            if tmp_path:
                tmp_path.unlink(missing_ok=True)
            return None
        ffprobe_status = get_ffprobe_status() if should_probe_duration else None
        duration_seconds = probe_media_duration_seconds(tmp_path) if should_probe_duration else None  # Only audio and video references need duration metadata.
        duration_probe_skipped = bool(should_probe_duration and ffprobe_status is not None and not ffprobe_status.available)
        if should_probe_duration and not duration_probe_skipped and duration_seconds is None:
            raise ValueError(f"Could not read {media_label} duration from {upload.filename or 'upload.bin'}")
        return MediaInput(
            file_name=upload.filename or "upload.bin",
            content_type=(upload.content_type or "").strip(),
            temp_path=tmp_path,
            size_bytes=size_bytes,
            duration_seconds=duration_seconds,
            duration_probe_skipped=duration_probe_skipped,
        )
    except Exception:
        if tmp_path:
            tmp_path.unlink(missing_ok=True)  # Avoid leaving partial temp files behind on failed uploads.
        raise
    finally:
        await upload.close()  # Release FastAPI's upload handle as soon as the file is staged.


async def _read_uploads(
    uploads: list[UploadFile] | None,
    *,
    should_probe_duration: bool = False,
    media_label: str = "upload",
) -> list[MediaInput]:
    media_items: list[MediaInput] = []
    for upload in uploads or []:
        media = await _read_upload(upload, should_probe_duration=should_probe_duration, media_label=media_label)
        if media is not None:
            media_items.append(media)
    return media_items  # Keep staged uploads explicit so failures can clean them up deterministically.


def _cleanup_media_items(media_items: list[MediaInput]) -> None:
    for media in media_items:
        media.cleanup()  # Best-effort cleanup is enough because temp file removal is idempotent.


@app.get("/health")
def healthcheck() -> dict[str, object]:
    ffprobe_status = get_ffprobe_status()
    return {
        "status": "ok",
        "ffprobeAvailable": ffprobe_status.available,
        "ffprobeSource": ffprobe_status.source,
        "ffprobePath": ffprobe_status.path,
        "ffprobeWarning": ffprobe_status.warning,
    }  # Surface backend media-probe readiness without failing the whole health check.


@app.post("/api/volcengine/jobs")
async def submit_seedance_job(
    prompt: str = Form(...),
    model_id: str = Form(DEFAULT_MODEL_ID),
    variant: str = Form("smart"),
    ratio: str = Form("16:9"),
    duration: int = Form(5),
    resolution: str | None = Form(None),
    generate_audio: bool = Form(False),
    camera_fixed: bool = Form(False),
    primary_image: UploadFile | None = File(None),
    last_frame_image: UploadFile | None = File(None),
    reference_images: list[UploadFile] | None = File(None),
    reference_videos: list[UploadFile] | None = File(None),
    reference_audios: list[UploadFile] | None = File(None),
) -> dict[str, object]:
    payload: SeedanceJobPayload | None = None
    staged_media: list[MediaInput] = []
    try:
        primary_image_media = await _read_upload(primary_image)
        if primary_image_media is not None:
            staged_media.append(primary_image_media)

        last_frame_image_media = await _read_upload(last_frame_image)
        if last_frame_image_media is not None:
            staged_media.append(last_frame_image_media)

        reference_image_media = await _read_uploads(reference_images)
        staged_media.extend(reference_image_media)

        reference_video_media = await _read_uploads(reference_videos, should_probe_duration=True, media_label="reference video")
        staged_media.extend(reference_video_media)

        reference_audio_media = await _read_uploads(reference_audios, should_probe_duration=True, media_label="reference audio")
        staged_media.extend(reference_audio_media)

        payload = SeedanceJobPayload(
            prompt=prompt,
            model_id=model_id,
            variant=variant if variant in {"smart", "reference"} else "smart",
            ratio=ratio if ratio in {"21:9", "16:9", "4:3", "1:1", "3:4", "9:16", "adaptive"} else "16:9",
            duration=duration,
            resolution=resolution if resolution in {"480p", "720p", "1080p"} else None,
            generate_audio=generate_audio,
            camera_fixed=camera_fixed,
            primary_image=primary_image_media,
            last_frame_image=last_frame_image_media,
            reference_images=reference_image_media,
            reference_videos=reference_video_media,
            reference_audios=reference_audio_media,
        )
        job = create_job(payload)
        payload = None  # The worker now owns the staged media lifecycle.
        return serialize_job(job)
    except ValueError as exc:
        if payload is not None:
            payload.cleanup()  # Discard staged files for rejected jobs.
        else:
            _cleanup_media_items(staged_media)
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        if payload is not None:
            payload.cleanup()  # Clean up staged files on unexpected submission failures.
        else:
            _cleanup_media_items(staged_media)
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.get("/api/volcengine/jobs/{job_id}")
def get_seedance_job(job_id: str) -> dict[str, object]:
    job = job_store.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return serialize_job(job)
