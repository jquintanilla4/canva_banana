from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Literal


SeedanceVariant = Literal["smart", "reference", "edit", "extend"]  # UI variant names.
VolcengineJobStatus = Literal["IN_QUEUE", "IN_PROGRESS", "COMPLETED", "FAILED"]  # Queue statuses expected by the UI.
SeedanceRatio = Literal["21:9", "16:9", "4:3", "1:1", "3:4", "9:16", "adaptive"]  # Supported ratio values.
SeedanceResolution = Literal["480p", "720p", "1080p", "4k"]  # Supported explicit resolution values; 4k is Seedance 2 only.
SeedanceOutputFormat = Literal["mp4", "mov"]  # Seedance 2.5 output container options.
JimengSeedanceResolution = Literal["480p", "720p", "1080p", "4k"]  # Dreamina has a VIP-only 4K output option.
JimengSeedanceModelVersion = Literal["seedance2.0fast", "seedance2.0", "seedance2.0_vip", "seedance2.0fast_vip", "seedance2.0mini", "seedance2.5"]  # Dreamina CLI model_version values.
JimengGenerationMode = Literal["auto", "multiframe"]  # Auto derives text/image/frames/reference commands from the attached media.

DEFAULT_MODEL_ID = "doubao-seedance-2-0-260128"  # Seedance 2 production model.
MODEL_LABELS = {
    "doubao-seedance-2-0-260128": "Seedance 2",
    "doubao-seedance-2-0-fast-260128": "Seedance 2 Fast",
    "doubao-seedance-2-0-mini-260615": "Seedance 2 Mini",
    "doubao-seedance-2-5-260628": "Seedance 2.5",
}  # Known backend model labels.
MODEL_RESOLUTIONS = {
    "doubao-seedance-2-0-260128": frozenset({"480p", "720p", "1080p", "4k"}),
    "doubao-seedance-2-0-fast-260128": frozenset({"480p", "720p"}),
    "doubao-seedance-2-0-mini-260615": frozenset({"480p", "720p"}),
    "doubao-seedance-2-5-260628": frozenset({"480p", "720p"}),
}  # Allowed resolutions per model; only Seedance 2 supports 1080p/4k.

SEEDANCE25_MODEL_IDS = frozenset({"doubao-seedance-2-5-260628"})  # Seedance 2.5 models follow different request rules.


def is_seedance25(model_id: str) -> bool:
    return model_id in SEEDANCE25_MODEL_IDS  # Centralize the 2.5 check for validation and request building.


@dataclass
class MediaInput:
    file_name: str
    content_type: str
    temp_path: Path
    size_bytes: int
    duration_seconds: float | None = None
    duration_probe_skipped: bool = False

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
    duration: int  # May be -1 on Seedance 2.5 to let the model auto-select.
    resolution: SeedanceResolution | JimengSeedanceResolution | None = None
    output_format: SeedanceOutputFormat | None = None  # Seedance 2.5 only; mp4 is the provider default.
    jimeng_model_version: JimengSeedanceModelVersion | None = None
    jimeng_mode: JimengGenerationMode = "auto"
    session_id: int = 0
    generate_audio: bool = False
    camera_fixed: bool = False
    primary_image: MediaInput | None = None
    last_frame_image: MediaInput | None = None
    reference_images: list[MediaInput] = field(default_factory=list)
    reference_videos: list[MediaInput] = field(default_factory=list)
    reference_audios: list[MediaInput] = field(default_factory=list)
    multiframe_images: list[MediaInput] = field(default_factory=list)
    transition_prompts: list[str] = field(default_factory=list)
    transition_durations: list[float] = field(default_factory=list)

    def iter_media_inputs(self) -> tuple[MediaInput, ...]:
        media_items = [
            *(media for media in (self.primary_image, self.last_frame_image) if media is not None),
            *self.reference_images,
            *self.reference_videos,
            *self.reference_audios,
            *self.multiframe_images,
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
