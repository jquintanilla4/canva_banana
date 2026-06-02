from __future__ import annotations

import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

PROJECT_ROOT = Path(__file__).resolve().parents[2]  # Reach the repo root from backend/tests.
sys.path.insert(0, str(PROJECT_ROOT / "backend" / "src"))  # Import the backend package without installing it.

from volcengine_service.models import MediaInput, SeedanceJobPayload
from volcengine_service.worker import _build_content


def build_media_input(path: Path, content_type: str) -> MediaInput:
    path.write_bytes(b"media")
    return MediaInput(
        file_name=path.name,
        content_type=content_type,
        temp_path=path,
        size_bytes=path.stat().st_size,
        duration_seconds=3.0,
    )  # Minimal staged media record for request-building tests.


class WorkerContentTests(unittest.TestCase):
    def test_reference_audio_content_uses_reference_audio_role(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            tmp_path = Path(tmp_dir)
            reference_image = build_media_input(tmp_path / "ref.png", "image/png")
            reference_video = build_media_input(tmp_path / "ref.mp4", "video/mp4")
            reference_audio = build_media_input(tmp_path / "ref.wav", "audio/wav")
            payload = SeedanceJobPayload(
                prompt="make a product video",
                model_id="doubao-seedance-2-0-260128",
                variant="reference",
                ratio="16:9",
                duration=5,
                reference_images=[reference_image],
                reference_videos=[reference_video],
                reference_audios=[reference_audio],
            )

            with patch("volcengine_service.worker.media_to_data_url", side_effect=lambda media: f"data:{media.file_name}"):
                with patch("volcengine_service.worker.upload_video_to_tos", return_value="https://example.com/ref.mp4"):
                    content = _build_content("job-1", payload, settings=object())  # Settings are only needed by the patched upload helper.

        self.assertEqual(content[1]["role"], "reference_image")
        self.assertEqual(content[2]["role"], "reference_video")
        self.assertEqual(content[3]["role"], "reference_audio")


if __name__ == "__main__":
    unittest.main()
