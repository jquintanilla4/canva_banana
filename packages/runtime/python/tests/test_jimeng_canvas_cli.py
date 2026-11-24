from __future__ import annotations

import json
import subprocess
import tempfile
import unittest
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import uvpython_service.jimeng_canvas_cli as canvas


class CanvasCliTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.settings_patch = patch.object(canvas, "get_settings", return_value=SimpleNamespace(jimeng_canvas_root_dir=self.root / ".jimeng-canvas"))
        self.settings_patch.start()
        self.addCleanup(self.settings_patch.stop)
        self.env_patch = patch.dict(canvas.os.environ, {"JIMENG_CANVAS_CLI_PATH": "", "DREAMINA_CANVAS_STATE_DIR": "", "JIMENG_CANVAS_PROFILE": ""})
        self.env_patch.start()
        self.addCleanup(self.env_patch.stop)
        canvas._LOGIN_SESSIONS.clear()

    def challenge(self, **overrides: object) -> dict[str, object]:
        values = {
            "deviceCode": "private-device",
            "userCode": "USER-CODE",
            "verificationUri": "https://jimeng.jianying.com/device",
            "verificationUriComplete": "https://jimeng.jianying.com/device?deviceCode=private-device",
        }
        values.update(overrides)
        return {"status": "pending", "challenge": values}

    def test_runner_unwraps_envelope_and_uses_isolated_noninteractive_profile(self) -> None:
        result = subprocess.CompletedProcess([], 0, json.dumps({"ok": True, "schemaVersion": "2", "data": {"id": "node1"}}), "credential-output")
        with patch.object(canvas, "_resolve_executable", return_value="/tool/dreamina-canvas"), patch.object(canvas.subprocess, "run", return_value=result) as run:
            self.assertEqual(canvas.run_canvas(["node", "get", "node1"]), {"id": "node1"})
        args, kwargs = run.call_args
        self.assertEqual(args[0], ["/tool/dreamina-canvas", "--format", "json", "--non-interactive", "--profile", "canva-banana", "node", "get", "node1"])
        self.assertEqual(kwargs["cwd"], self.root / ".jimeng-canvas")
        self.assertEqual(kwargs["env"]["DREAMINA_CANVAS_STATE_DIR"], str(self.root / ".jimeng-canvas/state"))
        self.assertFalse((self.root / "outputs").exists())

    def test_runner_preserves_exit_codes_without_exposing_provider_output(self) -> None:
        for exit_code in (1, 10, 11, 20):
            with self.subTest(exit_code=exit_code), patch.object(canvas, "_resolve_executable", return_value="tool"), patch.object(canvas.subprocess, "run", return_value=subprocess.CompletedProcess([], exit_code, "access_token=secret", "private-device")):
                with self.assertRaises(canvas.CanvasCliError) as caught:
                    canvas.run_canvas(["auth", "wait"])
                self.assertEqual(caught.exception.exit_code, exit_code)
                self.assertNotIn("secret", str(caught.exception))
                self.assertNotIn("private-device", str(caught.exception))

    def test_runner_timeout_does_not_expose_captured_output(self) -> None:
        with patch.object(canvas, "_resolve_executable", return_value="tool"), patch.object(canvas.subprocess, "run", side_effect=subprocess.TimeoutExpired(["tool", "private-device"], 30, "secret", "credential")):
            with self.assertRaises(canvas.CanvasCliError) as caught:
                canvas.run_canvas(["auth", "wait"])
        self.assertEqual(caught.exception.exit_code, 20)
        self.assertNotIn("secret", str(caught.exception))
        self.assertIsNone(caught.exception.__cause__)

    def test_runner_rejects_non_envelopes_and_invalid_data(self) -> None:
        for stdout in ("not-json", "[]", '{"ok":false,"error":{"message":"secret"}}', '{"ok":true,"data":[]}'):
            with self.subTest(stdout=stdout), patch.object(canvas, "_resolve_executable", return_value="tool"), patch.object(canvas.subprocess, "run", return_value=subprocess.CompletedProcess([], 0, stdout, "")):
                with self.assertRaises(canvas.CanvasCliError):
                    canvas.run_canvas(["version"])

    def test_override_is_separate_from_classic_executable(self) -> None:
        with patch.dict(canvas.os.environ, {"JIMENG_CANVAS_CLI_PATH": "/custom/canvas", "JIMENG_CLI_PATH": "/classic/dreamina"}), patch.object(canvas.shutil, "which", return_value="/custom/canvas") as which:
            self.assertEqual(canvas._resolve_executable(), "/custom/canvas")
        self.assertEqual(which.call_args.args[0], "/custom/canvas")

    def test_operator_profile_override_is_used_and_validated(self) -> None:
        result = subprocess.CompletedProcess([], 0, '{"ok":true,"data":{}}', "")
        with patch.dict(canvas.os.environ, {"JIMENG_CANVAS_PROFILE": "migration-probe"}), patch.object(canvas, "_resolve_executable", return_value="tool"), patch.object(canvas.subprocess, "run", return_value=result) as run:
            canvas.run_canvas(["version"])
        self.assertIn("migration-probe", run.call_args.args[0])
        with patch.dict(canvas.os.environ, {"JIMENG_CANVAS_PROFILE": "../outside"}):
            with self.assertRaises(canvas.CanvasCliError):
                canvas._profile()

    def test_explicit_state_directory_is_honored(self) -> None:
        with patch.dict(canvas.os.environ, {"DREAMINA_CANVAS_STATE_DIR": str(self.root / "operator-state")}):
            self.assertEqual(canvas._environment()["DREAMINA_CANVAS_STATE_DIR"], str(self.root / "operator-state"))

    def test_setup_status_reads_version_and_auth_only(self) -> None:
        with patch.object(canvas, "_resolve_executable", return_value="tool"), patch.object(canvas, "run_canvas", side_effect=[{"version": "1.4.1"}, {"loggedIn": True, "accessToken": "private"}]) as run:
            self.assertEqual(canvas.get_canvas_setup_status(), {"cliAvailable": True, "authenticated": True, "version": "1.4.1"})
        self.assertEqual([call.args[0] for call in run.call_args_list], [["version"], ["auth", "status"]])

    def test_unavailable_setup_status_is_actionable(self) -> None:
        with patch.object(canvas, "_resolve_executable", side_effect=canvas.CanvasCliError("Install Canvas first.")):
            self.assertEqual(canvas.get_canvas_setup_status(), {"cliAvailable": False, "authenticated": False, "message": "Install Canvas first."})

    def test_installer_is_scoped_and_does_not_return_script_output(self) -> None:
        response = MagicMock()
        response.read.return_value = b"official installer"
        with patch.object(canvas, "urlopen", return_value=response) as download, patch.object(canvas.subprocess, "run", return_value=subprocess.CompletedProcess([], 0, b"private", b"private")) as run, patch.object(canvas, "get_canvas_setup_status", return_value={"cliAvailable": True, "authenticated": False}):
            result = canvas.install_canvas_cli()
        self.assertEqual(download.call_args.args[0].full_url, canvas.CANVAS_INSTALL_URL)
        args, kwargs = run.call_args
        self.assertEqual(args[0], ["bash"])
        self.assertEqual(kwargs["env"]["DREAMINA_CANVAS_INSTALL_DIR"], str(self.root / ".jimeng-canvas/bin"))
        self.assertEqual(kwargs["env"]["DREAMINA_CANVAS_SKILL_DIR"], str(self.root / ".jimeng-canvas/skills"))
        self.assertNotIn("private", json.dumps(result))
        response.close.assert_called_once()

    def test_installer_rejects_unmanaged_executable_override(self) -> None:
        with patch.dict(canvas.os.environ, {"JIMENG_CANVAS_CLI_PATH": "/custom/canvas"}), patch.object(canvas.shutil, "which", return_value="/custom/canvas"), patch.object(canvas, "urlopen") as download:
            with self.assertRaises(canvas.CanvasCliError):
                canvas.install_canvas_cli()
        download.assert_not_called()

    def test_login_returns_only_public_challenge_fields(self) -> None:
        with patch.object(canvas, "run_canvas", return_value=self.challenge()) as run:
            result = canvas.start_canvas_login()
        run.assert_called_once_with(["auth", "login", "--no-browser"])
        self.assertEqual(result["userCode"], "USER-CODE")
        self.assertEqual(result["verificationUri"], "https://jimeng.jianying.com/device")
        self.assertNotIn("private-device", json.dumps(result))
        self.assertEqual(canvas._LOGIN_SESSIONS[result["loginSessionId"]].device_code, "private-device")

    def test_concurrent_login_requests_share_one_challenge(self) -> None:
        with patch.object(canvas, "run_canvas", return_value=self.challenge()) as run:
            with ThreadPoolExecutor(max_workers=5) as executor:
                results = list(executor.map(lambda _: canvas.start_canvas_login(), range(5)))
        self.assertEqual(len({result["loginSessionId"] for result in results}), 1)
        run.assert_called_once()

    def test_login_rejects_untrusted_and_non_https_urls(self) -> None:
        for url in ("http://jimeng.jianying.com/device", "https://evil.example/device", "https://jimeng.jianying.com.evil.example/device", "https://user:secret@jimeng.jianying.com/device", "https://jimeng.jianying.com:8443/device", "https://jimeng.jianying.com/device?device_code=private-device"):
            with self.subTest(url=url), patch.object(canvas, "run_canvas", return_value=self.challenge(verificationUri=url)):
                with self.assertRaises(canvas.CanvasCliError):
                    canvas.start_canvas_login()
        self.assertFalse(canvas._LOGIN_SESSIONS)

    def test_completed_login_removes_device_code(self) -> None:
        with patch.object(canvas, "run_canvas", side_effect=[self.challenge(), {"state": {"loggedIn": True}, "accessToken": "secret"}]) as run:
            session = canvas.start_canvas_login()
            result = canvas.check_canvas_login(session["loginSessionId"], poll_seconds=10)
        self.assertEqual(result, {"cliAvailable": True, "authenticated": True})
        self.assertFalse(canvas._LOGIN_SESSIONS)
        self.assertEqual(run.call_args.args[0], ["auth", "wait", "--device-code", "private-device", "--timeout", "10s"])

    def test_pending_login_keeps_same_session(self) -> None:
        with patch.object(canvas, "run_canvas", side_effect=[self.challenge(), canvas.CanvasCliError("Waiting.", exit_code=20)]):
            session = canvas.start_canvas_login()
            result = canvas.check_canvas_login(session["loginSessionId"])
        self.assertTrue(result["pending"])
        self.assertIn(session["loginSessionId"], canvas._LOGIN_SESSIONS)

    def test_expired_or_other_profile_session_cannot_be_polled(self) -> None:
        with patch.object(canvas, "run_canvas", return_value=self.challenge()):
            session = canvas.start_canvas_login()
        canvas._LOGIN_SESSIONS[session["loginSessionId"]].expires_at = 0
        with patch.object(canvas, "run_canvas") as run:
            with self.assertRaises(canvas.CanvasCliError) as caught:
                canvas.check_canvas_login(session["loginSessionId"])
        self.assertEqual(caught.exception.exit_code, 11)
        self.assertFalse(canvas._LOGIN_SESSIONS)
        run.assert_not_called()

    def test_already_authenticated_login_returns_no_challenge(self) -> None:
        with patch.object(canvas, "run_canvas", return_value={"state": {"loggedIn": True}}):
            self.assertEqual(canvas.start_canvas_login(), {"cliAvailable": True, "authenticated": True})

    def test_account_scope_is_stable_and_changes_with_account_or_space(self) -> None:
        values = []
        for user, space in ((100, {"kind": "personal"}), (100, {"kind": "personal"}), (200, {"kind": "personal"}), (100, {"kind": "team", "team": {"teamId": "5"}})):
            with patch.object(canvas, "run_canvas", side_effect=[{"userId": user, "token": "secret"}, space]):
                values.append(canvas.get_canvas_account_scope())
        self.assertEqual(values[0], values[1])
        self.assertEqual(len(set(values)), 3)
        self.assertTrue(all(len(value) == 64 for value in values))

    def test_account_scope_rejects_invalid_space_shapes(self) -> None:
        for space in ({"kind": {}}, {"kind": "team", "team": {}}, {"kind": "team", "team": {"teamId": ""}}):
            with self.subTest(space=space), patch.object(canvas, "run_canvas", side_effect=[{"userId": 100}, space]):
                with self.assertRaises(canvas.CanvasCliError):
                    canvas.get_canvas_account_scope()

    def test_account_scope_requires_authenticated_identity(self) -> None:
        with patch.object(canvas, "run_canvas", return_value={"displayName": "someone"}):
            with self.assertRaises(canvas.CanvasCliError) as caught:
                canvas.get_canvas_account_scope()
        self.assertEqual(caught.exception.exit_code, 11)

    def test_catalog_preserves_documented_controls_and_discards_unrelated_fields(self) -> None:
        model = {
            "type": "image", "model": "seedream-5.5", "displayName": "Seedream 5.5", "accessToken": "secret",
            "modes": [{
                "name": "i2i", "scenario": "standard", "vipRequired": True,
                "flags": [{"flag": "--resolution", "required": False, "values": ["2K", "4K"], "password": "private"}],
                "references": {"min": 1, "max": 9, "types": [{"mediaType": "image", "min": 1, "max": 9, "token": "private"}]},
                "forbiddenParamCombinations": [{"ratio": {"data_type": "string", "string_value": "auto"}}],
                "cookie": "private",
            }],
        }
        with patch.object(canvas, "run_canvas", return_value={"items": [model, {"type": "video", "model": "other", "modes": []}], "token": "secret"}) as run:
            result = canvas.get_canvas_catalog("image")
        run.assert_called_once_with(["model", "ls", "--refresh", "--type", "image"])
        self.assertEqual(len(result["items"]), 1)
        mode = result["items"][0]["modes"][0]
        self.assertEqual(mode["flags"][0]["values"], ["2K", "4K"])
        self.assertEqual(mode["references"]["types"], [{"mediaType": "image", "min": 1, "max": 9}])
        self.assertEqual(mode["forbiddenParamCombinations"], model["modes"][0]["forbiddenParamCombinations"])
        self.assertNotIn("secret", json.dumps(result))
        self.assertNotIn("private", json.dumps(result))

    def test_catalog_requires_items_array(self) -> None:
        with patch.object(canvas, "run_canvas", return_value={"items": {"model": "invalid"}}):
            with self.assertRaises(canvas.CanvasCliError):
                canvas.get_canvas_catalog("video")


if __name__ == "__main__":
    unittest.main()
