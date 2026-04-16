from __future__ import annotations

import tempfile
from pathlib import Path

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware

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


async def _read_upload(upload: UploadFile | None) -> MediaInput | None:
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
        return MediaInput(
            file_name=upload.filename or "upload.bin",
            content_type=(upload.content_type or "").strip(),
            temp_path=tmp_path,
            size_bytes=size_bytes,
        )
    except Exception:
        if tmp_path:
            tmp_path.unlink(missing_ok=True)  # Avoid leaving partial temp files behind on failed uploads.
        raise
    finally:
        await upload.close()  # Release FastAPI's upload handle as soon as the file is staged.


@app.get("/health")
def healthcheck() -> dict[str, str]:
    return {"status": "ok"}  # Basic local readiness probe.


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
    try:
        payload = SeedanceJobPayload(
            prompt=prompt,
            model_id=model_id,
            variant=variant if variant in {"smart", "reference"} else "smart",
            ratio=ratio if ratio in {"21:9", "16:9", "4:3", "1:1", "3:4", "9:16", "adaptive"} else "16:9",
            duration=duration,
            resolution=resolution if resolution in {"480p", "720p"} else None,
            generate_audio=generate_audio,
            camera_fixed=camera_fixed,
            primary_image=await _read_upload(primary_image),
            last_frame_image=await _read_upload(last_frame_image),
            reference_images=[media for media in [await _read_upload(upload) for upload in (reference_images or [])] if media],
            reference_videos=[media for media in [await _read_upload(upload) for upload in (reference_videos or [])] if media],
            reference_audios=[media for media in [await _read_upload(upload) for upload in (reference_audios or [])] if media],
        )
        job = create_job(payload)
        payload = None  # The worker now owns the staged media lifecycle.
        return serialize_job(job)
    except ValueError as exc:
        if payload is not None:
            payload.cleanup()  # Discard staged files for rejected jobs.
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        if payload is not None:
            payload.cleanup()  # Clean up staged files on unexpected submission failures.
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.get("/api/volcengine/jobs/{job_id}")
def get_seedance_job(job_id: str) -> dict[str, object]:
    job = job_store.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return serialize_job(job)
