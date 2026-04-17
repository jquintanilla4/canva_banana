from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Literal


SeedanceVariant = Literal["smart", "reference"]  # UI variant names.
VolcengineJobStatus = Literal["IN_QUEUE", "IN_PROGRESS", "COMPLETED", "FAILED"]  # Queue statuses expected by the UI.
SeedanceRatio = Literal["21:9", "16:9", "4:3", "1:1", "3:4", "9:16", "adaptive"]  # Supported ratio values.
SeedanceResolution = Literal["480p", "720p", "1080p"]  # Supported explicit resolution values.

DEFAULT_MODEL_ID = "doubao-seedance-2-0-260128"  # Seedance 2 production model.
MODEL_LABELS = {
    "doubao-seedance-2-0-260128": "Seedance 2",
    "doubao-seedance-2-0-fast-260128": "Seedance 2 Fast",
}  # Known backend model labels.


@dataclass
class MediaInput:
    file_name: str
    content_type: str
    temp_path: Path
    size_bytes: int

    def read_bytes(self) -> bytes:
        return self.temp_path.read_bytes()  # Read the staged upload only when the worker needs it.

    def cleanup(self) -> None:
        self.temp_path.unlink(missing_ok=True)  # Drop the staged file after the job finishes.


@dataclass
class SeedanceJobPayload:
    prompt: str
    model_id: str
    variant: SeedanceVariant
    ratio: SeedanceRatio
    duration: int
    resolution: SeedanceResolution | None = None
    generate_audio: bool = False
    camera_fixed: bool = False
    primary_image: MediaInput | None = None
    last_frame_image: MediaInput | None = None
    reference_images: list[MediaInput] = field(default_factory=list)
    reference_videos: list[MediaInput] = field(default_factory=list)
    reference_audios: list[MediaInput] = field(default_factory=list)

    def iter_media_inputs(self) -> tuple[MediaInput, ...]:
        media_items = [
            *(media for media in (self.primary_image, self.last_frame_image) if media is not None),
            *self.reference_images,
            *self.reference_videos,
            *self.reference_audios,
        ]
        return tuple(media_items)  # Centralize cleanup over every staged upload.

    def cleanup(self) -> None:
        for media in self.iter_media_inputs():
            media.cleanup()  # Best-effort removal keeps temp files from piling up.


@dataclass
class JobState:
    id: str
    model_id: str
    model_label: str
    variant: SeedanceVariant
    prompt: str
    status: VolcengineJobStatus
    created_at: int
    updated_at: int
    logs: list[str] = field(default_factory=list)
    request_id: str | None = None
    remote_task_id: str | None = None
    output_url: str | None = None
    last_frame_url: str | None = None
    error: str | None = None
