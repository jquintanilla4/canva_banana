from __future__ import annotations

import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest


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
