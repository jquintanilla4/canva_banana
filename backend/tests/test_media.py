from __future__ import annotations

import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

PROJECT_ROOT = Path(__file__).resolve().parents[2]  # Reach the repo root from backend/tests.
sys.path.insert(0, str(PROJECT_ROOT / "backend" / "src"))  # Import the backend package without installing it.

from volcengine_service.media import FfprobeStatus, _resolve_explicit_ffprobe_path, get_ffprobe_status, probe_media_duration_seconds


class FfprobeResolutionTests(unittest.TestCase):
    def test_explicit_override_requires_executable_permissions(self) -> None:
        with tempfile.NamedTemporaryFile() as tmp_file:
            override_path = Path(tmp_file.name)
            override_path.chmod(0o644)  # Simulate an existing file that cannot be executed.

            self.assertIsNone(_resolve_explicit_ffprobe_path(str(override_path)))

    def test_invalid_override_falls_back_to_system_ffprobe(self) -> None:
        with tempfile.NamedTemporaryFile() as tmp_file:
            override_path = Path(tmp_file.name)
            override_path.chmod(0o644)  # Simulate a broken explicit override path.

            def fake_which(command: str) -> str | None:
                if command == str(override_path):
                    return None
                if command == "ffprobe":
                    return "/usr/bin/ffprobe"
                return None

            with patch.dict(os.environ, {"VOLCENGINE_FFPROBE_PATH": str(override_path)}, clear=False):
                with patch("volcengine_service.media.shutil.which", side_effect=fake_which):
                    status = get_ffprobe_status()

        self.assertTrue(status.available)
        self.assertEqual(status.source, "system")
        self.assertEqual(status.path, "/usr/bin/ffprobe")
        self.assertIn("not executable", status.warning or "")

    def test_probe_duration_treats_subprocess_oserror_as_missing_ffprobe(self) -> None:
        with patch(
            "volcengine_service.media.get_ffprobe_status",
            return_value=FfprobeStatus(available=True, path="/tmp/ffprobe", source="env"),
        ):
            with patch("volcengine_service.media.subprocess.run", side_effect=PermissionError):
                duration_seconds = probe_media_duration_seconds(Path("/tmp/reference.mp4"))

        self.assertIsNone(duration_seconds)


if __name__ == "__main__":
    unittest.main()
