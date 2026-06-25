from __future__ import annotations

import sys
import tempfile
import unittest
from dataclasses import replace
from pathlib import Path
from unittest.mock import patch

PYTHON_APP_ROOT = Path(__file__).resolve().parents[2]  # Reach apps/python-backend from backend/tests.
sys.path.insert(0, str(PYTHON_APP_ROOT / "backend" / "src"))  # Import the backend package without installing it.

import uvpython_service.jimeng_worker as jimeng_worker_module
from uvpython_service.config import Settings
from uvpython_service.jimeng_worker import (
    JIMENG_MODEL_ID,
    JIMENG_WORK_DIR_SENTINEL,
    JimengCommandResult,
    _build_submit_command,
    _resolve_jimeng_executable,
    clear_jimeng_cache,
    _parse_jimeng_output,
    _validate_payload,
    check_jimeng_health,
    get_jimeng_setup_status,
    install_or_update_jimeng_cli,
    start_jimeng_login,
    jimeng_job_store,
)
from uvpython_service.models import JobState, MediaInput, SeedanceJobPayload


def build_settings(work_dir: Path) -> Settings:
    return Settings(
        ark_api_key="",
        volcengine_access_key="",
        volcengine_secret_key="",
        tos_bucket_name="seedance-assets",
        tos_region="cn-beijing",
        poll_interval_seconds=15,
        job_ttl_seconds=14400,
        max_terminal_jobs=400,
        max_logs_per_job=100,
        jimeng_cli_path="dreamina",
        jimeng_work_dir=work_dir,
        jimeng_submit_poll_seconds=30,
        jimeng_result_timeout_seconds=900,
        jimeng_query_interval_seconds=10,
    )  # Minimal settings object for command-building tests.


def build_payload(**overrides: object) -> SeedanceJobPayload:
    payload = {
        "prompt": "make a cinematic cat video",
        "model_id": JIMENG_MODEL_ID,
        "variant": "smart",
        "ratio": "16:9",
        "duration": 5,
        "resolution": "720p",
    }
    payload.update(overrides)
    return SeedanceJobPayload(**payload)  # Shared valid Jimeng payload.


class JimengWorkerTests(unittest.TestCase):
    def setUp(self) -> None:
        jimeng_worker_module._active_login_process = None  # Reset detached login tracking between tests.

    def test_text_to_video_command_uses_documented_cli_flags(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            settings = build_settings(Path(tmp_dir))
            command = _build_submit_command(build_payload(), settings)

        self.assertEqual(command, [
            "text2video",
            "--prompt=make a cinematic cat video",
            "--duration=5",
            "--ratio=16:9",
            "--video_resolution=720p",
            "--model_version=seedance2.0fast",
            "--poll=30",
        ])

    def test_image_to_video_command_uses_staged_image_path(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            tmp_path = Path(tmp_dir)
            image_path = tmp_path / "first.png"
            image_path.write_bytes(b"image")
            settings = build_settings(tmp_path)
            payload = build_payload(primary_image=MediaInput(
                file_name="first.png",
                content_type="image/png",
                temp_path=image_path,
                size_bytes=image_path.stat().st_size,
            ))

            command = _build_submit_command(payload, settings)

        self.assertEqual(command, [
            "image2video",
            f"--image={image_path}",
            "--prompt=make a cinematic cat video",
            "--duration=5",
            "--video_resolution=720p",
            "--model_version=seedance2.0fast",
            "--poll=30",
        ])

    def test_text_to_video_command_supports_vip_model_version(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            settings = build_settings(Path(tmp_dir))
        command = _build_submit_command(build_payload(jimeng_model_version="seedance2.0_vip", resolution="1080p"), settings)

        self.assertIn("--model_version=seedance2.0_vip", command)
        self.assertIn("--video_resolution=1080p", command)

    def test_fast_vip_rejects_1080p(self) -> None:
        with self.assertRaisesRegex(ValueError, "1080p requires model_version seedance2.0_vip"):
            _validate_payload(build_payload(jimeng_model_version="seedance2.0fast_vip", resolution="1080p"))

    def test_parse_output_reads_submit_id_and_downloaded_video(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            download_dir = Path(tmp_dir)
            video_path = download_dir / "result.mp4"
            video_path.write_bytes(b"video")

            parsed = _parse_jimeng_output('{"status":"querying","submit_id":"submit-1"}', download_dir=download_dir)

        self.assertEqual(parsed.submit_id, "submit-1")
        self.assertEqual(parsed.status, "success")
        self.assertEqual(parsed.output_path, video_path)

    def test_parse_output_ignores_download_path_outside_download_dir(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            root_dir = Path(tmp_dir)
            download_dir = root_dir / "downloads"
            external_dir = root_dir / "external"
            download_dir.mkdir()
            external_dir.mkdir()
            external_video_path = external_dir / "result.mp4"
            external_video_path.write_bytes(b"video")

            parsed = _parse_jimeng_output(
                f'{{"status":"success","submit_id":"submit-1","download_path":"{external_video_path}"}}',
                download_dir=download_dir,
            )

        self.assertEqual(parsed.submit_id, "submit-1")
        self.assertEqual(parsed.status, "success")
        self.assertIsNone(parsed.output_path)

    def test_parse_output_allows_initial_video_inside_job_dir(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            job_dir = Path(tmp_dir) / "job-1"
            download_dir = job_dir / "downloads"
            output_path = job_dir / "result.mp4"
            download_dir.mkdir(parents=True)
            output_path.write_bytes(b"video")

            parsed = _parse_jimeng_output(
                f'{{"status":"success","download_path":"{output_path}"}}',
                download_dir=download_dir,
                output_root_dir=job_dir,
            )

        self.assertEqual(parsed.status, "success")
        self.assertEqual(parsed.output_path, output_path.resolve())

    def test_parse_output_resolves_initial_relative_video_inside_job_dir(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            job_dir = Path(tmp_dir) / "job-1"
            download_dir = job_dir / "downloads"
            output_path = job_dir / "result.mp4"
            download_dir.mkdir(parents=True)
            output_path.write_bytes(b"video")

            parsed = _parse_jimeng_output(
                '{"status":"success","download_path":"result.mp4"}',
                download_dir=download_dir,
                output_root_dir=job_dir,
            )

        self.assertEqual(parsed.status, "success")
        self.assertEqual(parsed.output_path, output_path.resolve())

    def test_parse_output_reads_zero_exit_failure_reason(self) -> None:
        parsed = _parse_jimeng_output('{"submit_id":"submit-1","gen_status":"fail","fail_reason":"reference upload failed"}')

        self.assertEqual(parsed.submit_id, "submit-1")
        self.assertEqual(parsed.status, "failed")
        self.assertEqual(parsed.error_message, "reference upload failed")

    def test_parse_output_accepts_submit_id_with_empty_error_message(self) -> None:
        parsed = _parse_jimeng_output('{"submit_id":"submit-1","error_msg":""}')

        self.assertEqual(parsed.submit_id, "submit-1")
        self.assertIsNone(parsed.status)
        self.assertIsNone(parsed.error_message)

    def test_parse_output_reads_nested_provider_video_url(self) -> None:
        parsed = _parse_jimeng_output(
            '{"data":{"task_id":"task-123","gen_status":"completed","result":{"video_url":"https://example.com/result.mp4"}}}'
        )

        self.assertEqual(parsed.submit_id, "task-123")
        self.assertEqual(parsed.status, "success")
        self.assertEqual(parsed.output_url, "https://example.com/result.mp4")

    def test_parse_output_ignores_non_video_url_fields(self) -> None:
        parsed = _parse_jimeng_output(
            '{"data":{"task_id":"task-123","gen_status":"completed","help_url":"https://example.com/help"}}'
        )

        self.assertEqual(parsed.submit_id, "task-123")
        self.assertEqual(parsed.status, "success")
        self.assertIsNone(parsed.output_url)

    def test_parse_output_ignores_freeform_video_urls(self) -> None:
        parsed = _parse_jimeng_output("done: https://example.com/result.mp4")

        self.assertIsNone(parsed.output_url)
        self.assertEqual(parsed.status, "success")

    def test_reference_mode_uses_multimodal2video(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            tmp_path = Path(tmp_dir)
            image_path = tmp_path / "ref.png"
            video_path = tmp_path / "ref.mp4"
            audio_path = tmp_path / "ref.mp3"
            image_path.write_bytes(b"image")
            video_path.write_bytes(b"video")
            audio_path.write_bytes(b"audio")
            settings = build_settings(tmp_path)
            payload = build_payload(
                variant="reference",
                reference_images=[MediaInput("ref.png", "image/png", image_path, image_path.stat().st_size)],
                reference_videos=[MediaInput("ref.mp4", "video/mp4", video_path, video_path.stat().st_size)],
                reference_audios=[MediaInput("ref.mp3", "audio/mpeg", audio_path, audio_path.stat().st_size)],
            )

            _validate_payload(payload)
            command = _build_submit_command(payload, settings)

        self.assertEqual(command[0], "multimodal2video")
        self.assertIn(f"--image={image_path}", command)
        self.assertIn(f"--video={video_path}", command)
        self.assertIn(f"--audio={audio_path}", command)
        self.assertIn("--model_version=seedance2.0fast", command)
        self.assertIn("--video_resolution=720p", command)

    def test_reference_mode_requires_image_or_video_reference(self) -> None:
        with self.assertRaisesRegex(ValueError, "requires at least one image or video reference"):
            _validate_payload(build_payload(variant="reference", reference_audios=[MediaInput("ref.mp3", "audio/mpeg", Path("ref.mp3"), 5)]))

    def test_health_uses_user_credit_self_check(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            settings = build_settings(Path(tmp_dir))
            with patch("uvpython_service.jimeng_worker.get_settings", return_value=settings):
                with patch("uvpython_service.jimeng_worker._resolve_jimeng_executable", return_value="/bin/dreamina"):
                    with patch("uvpython_service.jimeng_worker._run_jimeng_command", return_value=JimengCommandResult(0, '{"credit":10}', "")) as run_command:
                        health = check_jimeng_health()

        self.assertEqual(health["status"], "ready")
        self.assertEqual(health["ready"], True)
        run_command.assert_called_once_with(["user_credit"], settings=settings, timeout_seconds=30)

    def test_setup_status_marks_cli_installed_when_login_is_missing(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            settings = build_settings(Path(tmp_dir))
            result = JimengCommandResult(1, "未检测到有效登录态，请先执行 dreamina login", "")
            with patch("uvpython_service.jimeng_worker.get_settings", return_value=settings):
                with patch("uvpython_service.jimeng_worker._resolve_jimeng_executable", return_value="/bin/dreamina"):
                    with patch("uvpython_service.jimeng_worker._run_jimeng_command", return_value=result):
                        status = get_jimeng_setup_status()

        self.assertEqual(status["status"], "login_required")
        self.assertEqual(status["cliAvailable"], True)
        self.assertEqual(status["authenticated"], False)
        self.assertIn("Jimeng CLI is installed", str(status["message"]))
        self.assertNotIn("Install/update", str(status["message"]))

    def test_resolve_cli_finds_manual_local_bin_install_without_shell_path(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            home_dir = Path(tmp_dir) / "home"
            work_dir = Path(tmp_dir) / "work"
            executable_path = home_dir / ".local" / "bin" / "dreamina"
            executable_path.parent.mkdir(parents=True)
            executable_path.write_text("#!/bin/sh\n", encoding="utf-8")
            executable_path.chmod(0o755)
            settings = replace(build_settings(work_dir), jimeng_cli_path="")

            with patch("uvpython_service.jimeng_worker.Path.home", return_value=home_dir):
                with patch.dict("uvpython_service.jimeng_worker.os.environ", {"PATH": "/usr/bin:/bin"}, clear=True):
                    resolved = _resolve_jimeng_executable(settings)

        self.assertEqual(resolved, str(executable_path))

    def test_resolve_cli_finds_app_managed_install_without_shell_path(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            work_dir = Path(tmp_dir) / "Application Support" / "The Institute" / "jimeng-work"
            executable_path = work_dir.parent / ".tools" / "jimeng" / "bin" / "dreamina"
            executable_path.parent.mkdir(parents=True)
            executable_path.write_text("#!/bin/sh\n", encoding="utf-8")
            executable_path.chmod(0o755)
            settings = replace(build_settings(work_dir), jimeng_cli_path="")

            with patch.dict("uvpython_service.jimeng_worker.os.environ", {"PATH": "/usr/bin:/bin"}, clear=True):
                resolved = _resolve_jimeng_executable(settings)

        self.assertEqual(resolved, str(executable_path))

    def test_clear_cache_removes_generated_videos_only(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            work_dir = Path(tmp_dir)
            video_path = work_dir / "job-1" / "downloads" / "result.mp4"
            log_path = work_dir / "login.log"
            tool_path = work_dir / ".tools" / "jimeng" / "bin" / "dreamina"
            video_path.parent.mkdir(parents=True)
            tool_path.parent.mkdir(parents=True)
            (work_dir / JIMENG_WORK_DIR_SENTINEL).touch()
            video_path.write_bytes(b"video")
            log_path.write_text("login", encoding="utf-8")
            tool_path.write_text("tool", encoding="utf-8")
            settings = build_settings(work_dir)

            with patch("uvpython_service.jimeng_worker.get_settings", return_value=settings):
                result = clear_jimeng_cache()

            self.assertEqual(result["status"], "ok")
            self.assertEqual(result["deletedFiles"], 1)
            self.assertEqual(result["bytesFreed"], 5)
            self.assertFalse(video_path.exists())
            self.assertTrue(log_path.exists())
            self.assertTrue(tool_path.exists())

    def test_clear_cache_keeps_active_and_referenced_job_videos(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            work_dir = Path(tmp_dir)
            active_video_path = work_dir / "active-job" / "downloads" / "active.mp4"
            completed_video_path = work_dir / "completed-job" / "downloads" / "completed.mp4"
            orphan_video_path = work_dir / "orphan" / "downloads" / "orphan.mp4"
            for video_path in (active_video_path, completed_video_path, orphan_video_path):
                video_path.parent.mkdir(parents=True, exist_ok=True)
                video_path.write_bytes(b"video")
            (work_dir / JIMENG_WORK_DIR_SENTINEL).touch()
            settings = build_settings(work_dir)
            current_ms = 9_999_999_999_999  # Keep test jobs visible after store TTL trimming.
            active_job = JobState(
                id="active-job",
                model_id=JIMENG_MODEL_ID,
                model_label="Seedance 2 (JM CLI)",
                variant="smart",
                prompt="active",
                status="IN_PROGRESS",
                created_at=current_ms,
                updated_at=current_ms,
            )
            completed_job = JobState(
                id="completed-job",
                model_id=JIMENG_MODEL_ID,
                model_label="Seedance 2 (JM CLI)",
                variant="smart",
                prompt="done",
                status="COMPLETED",
                created_at=current_ms,
                updated_at=current_ms,
                output_url=str(completed_video_path),
            )

            with patch("uvpython_service.store.get_settings", return_value=settings):
                fresh_store = type(jimeng_job_store)()
                fresh_store.create(active_job)
                fresh_store.create(completed_job)
            with patch("uvpython_service.jimeng_worker.get_settings", return_value=settings):
                with patch("uvpython_service.store.get_settings", return_value=settings):
                    with patch("uvpython_service.jimeng_worker.jimeng_job_store", fresh_store):
                        result = clear_jimeng_cache()

            self.assertEqual(result["status"], "ok")
            self.assertEqual(result["deletedFiles"], 1)
            self.assertTrue(active_video_path.exists())
            self.assertTrue(completed_video_path.exists())
            self.assertFalse(orphan_video_path.exists())

    def test_clear_cache_refuses_unmarked_work_dir(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            work_dir = Path(tmp_dir)
            unrelated_video_path = work_dir / "family-video.mp4"
            unrelated_video_path.write_bytes(b"video")
            settings = build_settings(work_dir)

            with patch("uvpython_service.jimeng_worker.get_settings", return_value=settings):
                with self.assertRaisesRegex(RuntimeError, "not marked as a Canva Banana Jimeng work directory"):
                    clear_jimeng_cache()

            self.assertTrue(unrelated_video_path.exists())

    def test_install_fetches_official_script_and_runs_bash(self) -> None:
        class FakeInstallerResponse:
            def read(self) -> bytes:
                return b"echo install"

            def close(self) -> None:
                pass

        with tempfile.TemporaryDirectory() as tmp_dir:
            settings = build_settings(Path(tmp_dir))
            completed = type("Completed", (), {
                "returncode": 0,
                "stdout": b"installed",
                "stderr": b"",
            })()
            with patch("uvpython_service.jimeng_worker.get_settings", return_value=settings):
                with patch("uvpython_service.jimeng_worker.urlopen", return_value=FakeInstallerResponse()):
                    with patch("uvpython_service.jimeng_worker.subprocess.run", return_value=completed) as run_command:
                        response = install_or_update_jimeng_cli()

        self.assertEqual(response["status"], "ok")
        run_command.assert_called_once()
        self.assertEqual(run_command.call_args.args[0], ["bash"])
        self.assertEqual(run_command.call_args.kwargs["input"], b"echo install")
        expected_install_dir = Path(tmp_dir).parent / ".tools" / "jimeng" / "bin"
        self.assertEqual(run_command.call_args.kwargs["env"]["DREAMINA_CLI_INSTALL_DIR"], str(expected_install_dir))
        self.assertIn(str(expected_install_dir), run_command.call_args.kwargs["env"]["PATH"])

    def test_start_login_launches_dreamina_without_blocking(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            settings = build_settings(Path(tmp_dir))
            process = type("Process", (), {"pid": 123, "poll": lambda self: None})()
            with patch("uvpython_service.jimeng_worker.get_settings", return_value=settings):
                with patch("uvpython_service.jimeng_worker._resolve_jimeng_executable", return_value="/bin/dreamina"):
                    with patch("uvpython_service.jimeng_worker.time.sleep"):
                        with patch("uvpython_service.jimeng_worker.subprocess.Popen", return_value=process) as popen_command:
                            response = start_jimeng_login(debug=True)

        self.assertEqual(response["status"], "started")
        self.assertEqual(response["pid"], 123)
        self.assertIn("output", response)
        self.assertEqual(popen_command.call_args.args[0], ["/bin/dreamina", "login", "--debug"])

    def test_start_login_reuses_active_process_without_launching_another(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            settings = build_settings(Path(tmp_dir))
            active_process = type("Process", (), {"pid": 123, "poll": lambda self: None})()
            jimeng_worker_module._active_login_process = active_process

            with patch("uvpython_service.jimeng_worker.get_settings", return_value=settings):
                with patch("uvpython_service.jimeng_worker._resolve_jimeng_executable", return_value="/bin/dreamina"):
                    with patch("uvpython_service.jimeng_worker.subprocess.Popen") as popen_command:
                        response = start_jimeng_login(debug=False)

        self.assertEqual(response["status"], "already_running")
        self.assertEqual(response["pid"], 123)
        popen_command.assert_not_called()

    def test_start_login_returns_printed_auth_url(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            settings = build_settings(Path(tmp_dir))

            class FakeProcess:
                pid = 123

                def poll(self) -> None:
                    login_log_path = next(Path(tmp_dir).glob("login-*.log"))
                    login_log_path.write_text("open https://example.com/login", encoding="utf-8")
                    return None

            with patch("uvpython_service.jimeng_worker.get_settings", return_value=settings):
                with patch("uvpython_service.jimeng_worker._resolve_jimeng_executable", return_value="/bin/dreamina"):
                    with patch("uvpython_service.jimeng_worker.time.sleep"):
                        with patch("uvpython_service.jimeng_worker.subprocess.Popen", return_value=FakeProcess()):
                            response = start_jimeng_login(debug=False)

        self.assertEqual(response["authUrl"], "https://example.com/login")
        self.assertEqual(response["message"], "Jimeng login URL is ready")


if __name__ == "__main__":
    unittest.main()
