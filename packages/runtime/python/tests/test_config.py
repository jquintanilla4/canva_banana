from __future__ import annotations

import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch


class HostEnvironmentTests(unittest.TestCase):
    def test_import_only_reads_an_explicit_environment_directory(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            (root / ".env.local").write_text("ARK_API_KEY=fixture-key\n")
            child = root / "child"
            child.mkdir()
            env = {key: value for key, value in os.environ.items() if key not in {"ARK_API_KEY", "CANVA_BANANA_ENV_DIR"}}
            env["PYTHONPATH"] = str(Path(__file__).resolve().parents[1] / "src")
            code = "import os; import uvpython_service.config; assert os.environ.get('ARK_API_KEY') == EXPECTED"
            subprocess.run([sys.executable, "-c", code.replace("EXPECTED", "None")], cwd=child, env=env, check=True)
            env["CANVA_BANANA_ENV_DIR"] = str(root)
            subprocess.run([sys.executable, "-c", code.replace("EXPECTED", "'fixture-key'")], cwd=child, env=env, check=True)


class CanvasStorageSettingsTests(unittest.TestCase):
    def test_canvas_default_storage_path_keeps_existing_state_and_jobs(self) -> None:
        from uvpython_service.config import get_settings

        with patch.dict(os.environ, {}, clear=True), patch("uvpython_service.config._find_backend_dir", return_value=Path("/runtime")):
            settings = get_settings.__wrapped__()

        self.assertEqual(settings.jimeng_canvas_root_dir, Path("/runtime/.jimeng-canvas"))

    def test_canvas_keeps_existing_storage_path_from_legacy_work_directory(self) -> None:
        from uvpython_service.config import get_settings

        with patch.dict(os.environ, {"JIMENG_WORK_DIR": "/existing/user-data/jimeng-work"}, clear=True):
            settings = get_settings.__wrapped__()

        self.assertEqual(settings.jimeng_canvas_root_dir, Path("/existing/user-data/.jimeng-canvas"))

    def test_explicit_canvas_storage_path_wins_over_legacy_directory(self) -> None:
        from uvpython_service.config import get_settings

        with patch.dict(os.environ, {"JIMENG_CANVAS_ROOT_DIR": "/canvas-root", "JIMENG_WORK_DIR": "/existing/jimeng-work"}, clear=True):
            settings = get_settings.__wrapped__()

        self.assertEqual(settings.jimeng_canvas_root_dir, Path("/canvas-root"))
