from __future__ import annotations

import sys
import tempfile
import unittest
from dataclasses import replace
from pathlib import Path
from threading import Event, Thread
from unittest.mock import MagicMock, patch

PYTHON_APP_ROOT = Path(__file__).resolve().parents[2]  # Reach apps/python-backend from backend/tests.
sys.path.insert(0, str(PYTHON_APP_ROOT / "backend" / "src"))  # Import the backend package without installing it.

import uvpython_service.jimeng_worker as jimeng_worker_module
from uvpython_service.config import Settings
from uvpython_service.jimeng_worker import (
    JIMENG_MODEL_ID,
    JIMENG_MULTIFRAME_MODEL_ID,
    JIMENG_SEEDANCE_25_MODEL_ID,
    JIMENG_WORK_DIR_SENTINEL,
    JimengCommandResult,
    _build_submit_command,
    _get_missing_jimeng_cli_capability,
    _resolve_jimeng_executable,
    clear_jimeng_cache,
    _parse_jimeng_output,
    _validate_payload,
    check_jimeng_login,
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
        jimeng_submit_timeout_seconds=300,
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
        jimeng_worker_module._active_login_sessions.clear()  # Reset Device Flow sessions between tests.
        jimeng_worker_module._login_start_inflight = None
        if jimeng_worker_module._login_expiry_timer:
            jimeng_worker_module._login_expiry_timer.cancel()
        jimeng_worker_module._login_expiry_timer = None
        jimeng_worker_module._clear_jimeng_capability_cache()  # Keep executable capability cases independent.

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
            "--session=0",
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
            "--session=0",
            "--poll=30",
        ])

    def test_text_to_video_command_supports_vip_model_version(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            settings = build_settings(Path(tmp_dir))
        command = _build_submit_command(build_payload(jimeng_model_version="seedance2.0_vip", resolution="1080p"), settings)

        self.assertIn("--model_version=seedance2.0_vip", command)
        self.assertIn("--video_resolution=1080p", command)

    def test_submit_timeout_adds_allowance_for_all_staged_media(self) -> None:
        media = [
            MediaInput("image.png", "image/png", Path("/tmp/image.png"), 32 * 1024 * 1024),
            MediaInput("video.mp4", "video/mp4", Path("/tmp/video.mp4"), (64 * 1024 * 1024) + 1),
        ]
        payload = build_payload(primary_image=media[0], reference_videos=[media[1]])

        timeout_seconds = jimeng_worker_module._get_submit_timeout_seconds(payload, build_settings(Path("/tmp")))

        self.assertEqual(timeout_seconds, 300 + 1537)

    def test_submit_timeout_uses_configured_baseline_without_media(self) -> None:
        settings = replace(build_settings(Path("/tmp")), jimeng_submit_timeout_seconds=720)

        timeout_seconds = jimeng_worker_module._get_submit_timeout_seconds(build_payload(), settings)

        self.assertEqual(timeout_seconds, 720)

    def test_submit_timeout_cannot_expire_before_the_initial_poll(self) -> None:
        settings = replace(build_settings(Path("/tmp")), jimeng_submit_poll_seconds=600)

        timeout_seconds = jimeng_worker_module._get_submit_timeout_seconds(build_payload(), settings)

        self.assertEqual(timeout_seconds, 720)

    def test_execute_job_uses_the_size_aware_submit_timeout(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            settings = build_settings(Path(tmp_dir))
            with patch("uvpython_service.jimeng_worker.get_settings", return_value=settings):
                with patch("uvpython_service.jimeng_worker._ensure_jimeng_work_dir"):
                    with patch("uvpython_service.jimeng_worker._get_submit_timeout_seconds", return_value=1840) as get_timeout:
                        with patch(
                            "uvpython_service.jimeng_worker._run_jimeng_command",
                            return_value=JimengCommandResult(0, '{"video_url":"https://example.com/result.mp4"}', ""),
                        ) as run_command:
                            with patch.object(jimeng_job_store, "update"):
                                payload = build_payload()
                                jimeng_worker_module._execute_job("job-1", payload)

        get_timeout.assert_called_once_with(payload, settings)
        self.assertEqual(run_command.call_args.kwargs["timeout_seconds"], 1840)

    def test_fast_vip_rejects_1080p(self) -> None:
        with self.assertRaisesRegex(ValueError, "supports video_resolution: 720p"):
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
                reference_videos=[MediaInput("ref.mp4", "video/mp4", video_path, video_path.stat().st_size, duration_seconds=5.0)],
                reference_audios=[MediaInput("ref.mp3", "audio/mpeg", audio_path, audio_path.stat().st_size, duration_seconds=5.0)],
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
        with self.assertRaisesRegex(ValueError, "requires an image or video"):
            _validate_payload(build_payload(variant="reference", reference_audios=[MediaInput("ref.mp3", "audio/mpeg", Path("ref.mp3"), 5)]))

    def test_frames_command_uses_first_and_last_images(self) -> None:
        first = MediaInput("first.png", "image/png", Path("/tmp/first.png"), 1)
        last = MediaInput("last.png", "image/png", Path("/tmp/last.png"), 1)
        command = _build_submit_command(build_payload(primary_image=first, last_frame_image=last), build_settings(Path("/tmp")))

        self.assertEqual(command[0], "frames2video")
        self.assertIn("--first=/tmp/first.png", command)
        self.assertIn("--last=/tmp/last.png", command)

    def test_seedance25_supports_audio_only_and_thirty_seconds(self) -> None:
        audio = MediaInput("ref.mp3", "audio/mpeg", Path("/tmp/ref.mp3"), 1, duration_seconds=30.0)
        payload = build_payload(
            model_id=JIMENG_SEEDANCE_25_MODEL_ID,
            variant="reference",
            jimeng_model_version="seedance2.5",
            resolution="480p",
            duration=30,
            reference_audios=[audio],
        )

        _validate_payload(payload)

    def test_multiframe_command_repeats_transition_prompts(self) -> None:
        images = [MediaInput(f"{index}.png", "image/png", Path(f"/tmp/{index}.png"), 1) for index in range(3)]
        payload = build_payload(
            model_id=JIMENG_MULTIFRAME_MODEL_ID,
            jimeng_mode="multiframe",
            resolution="1080p",
            multiframe_images=images,
            transition_prompts=["one to two", "two to three"],
        )

        _validate_payload(payload)
        command = _build_submit_command(payload, build_settings(Path("/tmp")))

        self.assertEqual(command[0], "multiframe2video")
        self.assertEqual(command.count("--transition-prompt=one to two"), 1)
        self.assertEqual(command.count("--transition-prompt=two to three"), 1)

    def test_two_image_multiframe_rejects_transition_settings(self) -> None:
        images = [MediaInput(f"{index}.png", "image/png", Path(f"/tmp/{index}.png"), 1) for index in range(2)]
        payload = build_payload(
            model_id=JIMENG_MULTIFRAME_MODEL_ID,
            jimeng_mode="multiframe",
            multiframe_images=images,
            transition_prompts=["ignored transition"],
            transition_durations=[3],
        )

        with self.assertRaisesRegex(ValueError, "uses prompt and duration instead"):
            _validate_payload(payload)

    def test_multiframe_model_and_mode_must_match(self) -> None:
        with self.assertRaisesRegex(ValueError, "model and mode must be selected together"):
            _validate_payload(build_payload(jimeng_mode="multiframe"))

    def test_multiframe_rejects_non_multiframe_media(self) -> None:
        images = [MediaInput(f"{index}.png", "image/png", Path(f"/tmp/{index}.png"), 1) for index in range(3)]
        payload = build_payload(
            model_id=JIMENG_MULTIFRAME_MODEL_ID,
            jimeng_mode="multiframe",
            multiframe_images=images,
            transition_prompts=["one to two", "two to three"],
            reference_videos=[MediaInput("ref.mp4", "video/mp4", Path("/tmp/ref.mp4"), 1, duration_seconds=5.0)],
        )

        with self.assertRaisesRegex(ValueError, "only accepts its frame images"):
            _validate_payload(payload)

    def test_auto_mode_rejects_multiframe_media(self) -> None:
        images = [MediaInput(f"{index}.png", "image/png", Path(f"/tmp/{index}.png"), 1) for index in range(2)]

        with self.assertRaisesRegex(ValueError, "require the Multi-frame model and mode"):
            _validate_payload(build_payload(multiframe_images=images))

    def test_health_uses_user_credit_self_check(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            settings = build_settings(Path(tmp_dir))
            with patch("uvpython_service.jimeng_worker.get_settings", return_value=settings):
                with patch("uvpython_service.jimeng_worker._resolve_jimeng_executable", return_value="/bin/dreamina"):
                    with patch("uvpython_service.jimeng_worker._is_installer_managed_jimeng_executable", return_value=True):
                        with patch("uvpython_service.jimeng_worker._read_jimeng_release_version", return_value="1.4.15"):
                            with patch("uvpython_service.jimeng_worker._get_missing_jimeng_cli_capability", return_value=None) as check_capabilities:
                                with patch("uvpython_service.jimeng_worker._run_jimeng_command", return_value=JimengCommandResult(0, '{"credit":10}', "")) as run_command:
                                    health = check_jimeng_health()

        self.assertEqual(health["status"], "ready")
        self.assertEqual(health["ready"], True)
        run_command.assert_called_once_with(["user_credit"], settings=settings, timeout_seconds=30, executable="/bin/dreamina")
        check_capabilities.assert_called_once_with("/bin/dreamina", settings)

    def test_setup_status_marks_cli_installed_when_login_is_missing(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            settings = build_settings(Path(tmp_dir))
            result = JimengCommandResult(1, "未检测到有效登录态，请先执行 dreamina login", "")
            with patch("uvpython_service.jimeng_worker.get_settings", return_value=settings):
                with patch("uvpython_service.jimeng_worker._resolve_jimeng_executable", return_value="/bin/dreamina"):
                    with patch("uvpython_service.jimeng_worker._is_installer_managed_jimeng_executable", return_value=True):
                        with patch("uvpython_service.jimeng_worker._run_jimeng_command", return_value=result):
                            with patch("uvpython_service.jimeng_worker._read_jimeng_release_version", return_value="1.4.15"):
                                with patch("uvpython_service.jimeng_worker._get_missing_jimeng_cli_capability", return_value=None):
                                    status = get_jimeng_setup_status()

        self.assertEqual(status["status"], "login_required")
        self.assertEqual(status["cliAvailable"], True)
        self.assertEqual(status["authenticated"], False)
        self.assertIn("Jimeng CLI is installed", str(status["message"]))
        self.assertNotIn("Install/update", str(status["message"]))

    def test_setup_status_returns_error_when_capability_probe_raises(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            settings = build_settings(Path(tmp_dir))
            with patch("uvpython_service.jimeng_worker.get_settings", return_value=settings):
                with patch("uvpython_service.jimeng_worker._resolve_jimeng_executable", return_value="/bin/dreamina"):
                    with patch("uvpython_service.jimeng_worker._is_installer_managed_jimeng_executable", return_value=True):
                        with patch("uvpython_service.jimeng_worker._read_jimeng_release_version", return_value="1.4.15"):
                            with patch("uvpython_service.jimeng_worker._run_jimeng_command", return_value=JimengCommandResult(0, '{"credit":10}', "")):
                                with patch("uvpython_service.jimeng_worker._get_missing_jimeng_cli_capability", side_effect=TimeoutError("timed out")):
                                    status = get_jimeng_setup_status()

        self.assertEqual(status["status"], "error")  # A hung or swapped binary must not escape as an unhandled 500.
        self.assertEqual(status["ready"], False)
        self.assertEqual(status["cliAvailable"], True)
        self.assertEqual(status["authenticated"], True)
        self.assertIn("capability check could not run", str(status["message"]))

    def test_setup_status_accepts_a_capable_managed_cli_despite_stale_version_metadata(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            settings = build_settings(Path(tmp_dir))
            with patch("uvpython_service.jimeng_worker.get_settings", return_value=settings):
                with patch("uvpython_service.jimeng_worker._resolve_jimeng_executable", return_value="/bin/dreamina"):
                    with patch("uvpython_service.jimeng_worker._is_installer_managed_jimeng_executable", return_value=True):
                        with patch("uvpython_service.jimeng_worker._run_jimeng_command", return_value=JimengCommandResult(0, '{"credit":10}', "")):
                            with patch("uvpython_service.jimeng_worker._read_jimeng_release_version", return_value="1.4.14"):
                                with patch("uvpython_service.jimeng_worker._get_missing_jimeng_cli_capability", return_value=None) as check_capabilities:
                                    status = get_jimeng_setup_status()

        self.assertEqual(status["status"], "ready")
        self.assertTrue(status["ready"])
        self.assertTrue(status["authenticated"])
        self.assertIsNone(status["cliVersion"])
        check_capabilities.assert_called_once_with("/bin/dreamina", settings)

    def test_setup_status_checks_the_managed_executable_despite_current_global_metadata(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            settings = build_settings(Path(tmp_dir))
            with patch("uvpython_service.jimeng_worker.get_settings", return_value=settings):
                with patch("uvpython_service.jimeng_worker._resolve_jimeng_executable", return_value="/app-tools/dreamina"):
                    with patch("uvpython_service.jimeng_worker._is_installer_managed_jimeng_executable", return_value=True):
                        with patch("uvpython_service.jimeng_worker._read_jimeng_release_version", return_value="1.4.15"):
                            with patch("uvpython_service.jimeng_worker._run_jimeng_command", return_value=JimengCommandResult(0, '{"credit":10}', "")):
                                with patch("uvpython_service.jimeng_worker._get_missing_jimeng_cli_capability", return_value="Multi-frame video") as check_capabilities:
                                    status = get_jimeng_setup_status()

        self.assertEqual(status["status"], "update_required")
        self.assertFalse(status["ready"])
        self.assertEqual(status["cliVersion"], "1.4.15")
        self.assertIn("missing Multi-frame video support", str(status["message"]))
        check_capabilities.assert_called_once_with("/app-tools/dreamina", settings)

    def test_setup_status_accepts_a_capable_custom_cli_despite_stale_installer_metadata(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            settings = replace(build_settings(Path(tmp_dir)), jimeng_cli_path="/custom/dreamina")
            with patch("uvpython_service.jimeng_worker.get_settings", return_value=settings):
                with patch("uvpython_service.jimeng_worker._resolve_jimeng_executable", return_value="/custom/dreamina"):
                    with patch("uvpython_service.jimeng_worker._run_jimeng_command", return_value=JimengCommandResult(0, '{"credit":10}', "")):
                        with patch("uvpython_service.jimeng_worker._get_missing_jimeng_cli_capability", return_value=None) as check_capabilities:
                            with patch("uvpython_service.jimeng_worker._read_jimeng_release_version", return_value="1.4.14") as read_version:
                                status = get_jimeng_setup_status()

        self.assertEqual(status["status"], "ready")
        self.assertIsNone(status["cliVersion"])
        check_capabilities.assert_called_once_with("/custom/dreamina", settings)
        read_version.assert_not_called()

    def test_setup_status_rejects_an_incompatible_custom_cli_despite_current_installer_metadata(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            settings = replace(build_settings(Path(tmp_dir)), jimeng_cli_path="/custom/dreamina")
            with patch("uvpython_service.jimeng_worker.get_settings", return_value=settings):
                with patch("uvpython_service.jimeng_worker._resolve_jimeng_executable", return_value="/custom/dreamina"):
                    with patch("uvpython_service.jimeng_worker._run_jimeng_command", return_value=JimengCommandResult(0, '{"credit":10}', "")):
                        with patch("uvpython_service.jimeng_worker._get_missing_jimeng_cli_capability", return_value="Seedance 2.5 video"):
                            with patch("uvpython_service.jimeng_worker._read_jimeng_release_version", return_value="1.4.15") as read_version:
                                status = get_jimeng_setup_status()

        self.assertEqual(status["status"], "update_required")
        self.assertIn("Seedance 2.5 video", str(status["message"]))
        self.assertIn("/custom/dreamina", str(status["message"]))
        self.assertIn("in-app installer", str(status["message"]))
        read_version.assert_not_called()

    def test_custom_cli_capability_check_uses_the_resolved_executable(self) -> None:
        settings = build_settings(Path("/tmp/jimeng-test"))
        help_outputs = [
            JimengCommandResult(0, "--headless checklogin", ""),
            JimengCommandResult(0, "seedance2.5", ""),
            JimengCommandResult(0, "--transition-prompt --video_resolution", ""),
            JimengCommandResult(0, "", ""),  # frames2video is presence-only; help text is not parsed.
        ]
        with patch("uvpython_service.jimeng_worker._run_jimeng_command", side_effect=help_outputs) as run_command:
            missing_capability = _get_missing_jimeng_cli_capability("/custom/dreamina", settings)

        self.assertIsNone(missing_capability)
        self.assertEqual(run_command.call_count, 4)
        self.assertEqual([call.args[0] for call in run_command.call_args_list], [
            ["login", "-h"],
            ["text2video", "-h"],
            ["multiframe2video", "-h"],
            ["frames2video", "-h"],
        ])
        for call in run_command.call_args_list:
            self.assertEqual(call.kwargs["executable"], "/custom/dreamina")

    def test_setup_status_reuses_capability_check_for_the_same_executable(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            executable_path = Path(tmp_dir) / "dreamina"
            executable_path.write_text("#!/bin/sh\n", encoding="utf-8")
            settings = replace(build_settings(Path(tmp_dir) / "work"), jimeng_cli_path=str(executable_path))
            with patch("uvpython_service.jimeng_worker.get_settings", return_value=settings):
                with patch("uvpython_service.jimeng_worker._run_jimeng_command", return_value=JimengCommandResult(0, '{"credit":10}', "")):
                    with patch("uvpython_service.jimeng_worker._get_missing_jimeng_cli_capability", return_value=None) as check_capabilities:
                        first_status = get_jimeng_setup_status()
                        second_status = get_jimeng_setup_status()

        self.assertTrue(first_status["ready"])
        self.assertTrue(second_status["ready"])
        check_capabilities.assert_called_once_with(str(executable_path), settings)

    def test_capability_cache_rechecks_after_executable_replacement(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            executable_path = Path(tmp_dir) / "dreamina"
            replacement_path = Path(tmp_dir) / "dreamina-new"
            executable_path.write_text("old", encoding="utf-8")
            replacement_path.write_text("new-build", encoding="utf-8")
            settings = replace(build_settings(Path(tmp_dir) / "work"), jimeng_cli_path=str(executable_path))
            with patch("uvpython_service.jimeng_worker._get_missing_jimeng_cli_capability", side_effect=["Seedance 2.5 video", None]) as check_capabilities:
                first_result = jimeng_worker_module._get_cached_missing_jimeng_cli_capability(str(executable_path), settings)
                replacement_path.replace(executable_path)
                second_result = jimeng_worker_module._get_cached_missing_jimeng_cli_capability(str(executable_path), settings)

        self.assertEqual(first_result, "Seedance 2.5 video")
        self.assertIsNone(second_result)
        self.assertEqual(check_capabilities.call_count, 2)

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

    def test_resolve_cli_prefers_app_managed_install_for_dreamina_command_override(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            work_dir = Path(tmp_dir) / "Application Support" / "The Institute" / "jimeng-work"
            executable_path = work_dir.parent / ".tools" / "jimeng" / "bin" / "dreamina"
            executable_path.parent.mkdir(parents=True)
            executable_path.write_text("#!/bin/sh\n", encoding="utf-8")
            executable_path.chmod(0o755)
            global_executable_path = Path(tmp_dir) / "global-bin" / "dreamina"
            global_executable_path.parent.mkdir(parents=True)
            global_executable_path.write_text("#!/bin/sh\n", encoding="utf-8")
            global_executable_path.chmod(0o755)
            settings = replace(build_settings(work_dir), jimeng_cli_path="dreamina")

            with patch.dict("uvpython_service.jimeng_worker.os.environ", {"PATH": str(global_executable_path.parent)}, clear=True):
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
            self.assertEqual(result["invalidatedJobIds"], [])
            self.assertFalse(video_path.exists())
            self.assertTrue(log_path.exists())
            self.assertTrue(tool_path.exists())

    def test_clear_cache_keeps_active_job_videos_and_invalidates_deleted_outputs(self) -> None:
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
            self.assertEqual(result["deletedFiles"], 2)
            self.assertTrue(active_video_path.exists())
            self.assertFalse(completed_video_path.exists())
            self.assertFalse(orphan_video_path.exists())
            self.assertIsNone(fresh_store.get("completed-job").output_url)
            self.assertEqual(result["invalidatedJobIds"], ["completed-job"])

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

    def test_install_refuses_to_install_an_unused_binary_when_custom_cli_is_configured(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            settings = replace(build_settings(Path(tmp_dir)), jimeng_cli_path="/custom/dreamina")
            with patch("uvpython_service.jimeng_worker.get_settings", return_value=settings):
                with patch("uvpython_service.jimeng_worker.urlopen") as download_installer:
                    with patch("uvpython_service.jimeng_worker.subprocess.run") as run_command:
                        with self.assertRaisesRegex(RuntimeError, "unset JIMENG_CLI_PATH"):
                            install_or_update_jimeng_cli()

        download_installer.assert_not_called()
        run_command.assert_not_called()

    def test_install_allows_dreamina_command_override(self) -> None:
        class FakeInstallerResponse:
            def read(self) -> bytes:
                return b"echo install"

            def close(self) -> None:
                pass

        with tempfile.TemporaryDirectory() as tmp_dir:
            settings = replace(build_settings(Path(tmp_dir)), jimeng_cli_path="dreamina")
            completed = type("Completed", (), {
                "returncode": 0,
                "stdout": b"installed",
                "stderr": b"",
            })()
            with patch("uvpython_service.jimeng_worker.get_settings", return_value=settings):
                with patch("uvpython_service.jimeng_worker.urlopen", return_value=FakeInstallerResponse()) as download_installer:
                    with patch("uvpython_service.jimeng_worker.subprocess.run", return_value=completed) as run_command:
                        response = install_or_update_jimeng_cli()

        self.assertEqual(response["status"], "ok")
        download_installer.assert_called_once()
        run_command.assert_called_once()
        expected_install_dir = Path(tmp_dir).parent / ".tools" / "jimeng" / "bin"
        search_path = run_command.call_args.kwargs["env"]["PATH"]
        self.assertEqual(search_path.split(jimeng_worker_module.os.pathsep, 1)[0], str(expected_install_dir))

    def test_start_login_returns_device_flow_material(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            settings = build_settings(Path(tmp_dir))
            with patch("uvpython_service.jimeng_worker.get_settings", return_value=settings):
                with patch(
                    "uvpython_service.jimeng_worker._run_jimeng_command",
                    return_value=JimengCommandResult(
                        0,
                        '{"verification_uri":"https://example.com/login","user_code":"ABCD-EFGH","device_code":"server-secret"}',
                        "",
                    ),
                ) as run_command:
                    response = start_jimeng_login()

        self.assertEqual(response["status"], "authorization_required")
        self.assertEqual(response["verificationUri"], "https://example.com/login")
        self.assertEqual(response["userCode"], "ABCD-EFGH")
        self.assertNotIn("deviceCode", response)
        self.assertEqual(jimeng_worker_module._active_login_sessions[response["loginSessionId"]][0], "server-secret")
        run_command.assert_called_once_with(["login", "--headless"], settings=settings, timeout_seconds=30)

    def test_start_login_coalesces_overlapping_device_flows(self) -> None:
        first_command_started = Event()
        second_request_started = Event()
        responses: dict[str, dict[str, object]] = {}
        errors: dict[str, BaseException] = {}

        def run_command(*_args: object, **_kwargs: object) -> JimengCommandResult:
            first_command_started.set()
            self.assertTrue(second_request_started.wait(timeout=1))
            return JimengCommandResult(
                0,
                '{"verification_uri":"https://example.com/login","user_code":"SHARED","device_code":"shared-secret"}',
                "",
            )

        def start_login(name: str) -> None:
            if name == "newer":
                second_request_started.set()
            try:
                responses[name] = start_jimeng_login()
            except BaseException as exc:  # Capture thread failures for the main test assertion.
                errors[name] = exc

        with tempfile.TemporaryDirectory() as tmp_dir:
            settings = build_settings(Path(tmp_dir))
            with patch("uvpython_service.jimeng_worker.get_settings", return_value=settings):
                with patch("uvpython_service.jimeng_worker._run_jimeng_command", side_effect=run_command) as run_command_mock:
                    older_thread = Thread(target=start_login, args=("older",))
                    newer_thread = Thread(target=start_login, args=("newer",))
                    older_thread.start()
                    self.assertTrue(first_command_started.wait(timeout=1))
                    newer_thread.start()
                    older_thread.join(timeout=2)
                    newer_thread.join(timeout=2)

        self.assertFalse(older_thread.is_alive())
        self.assertFalse(newer_thread.is_alive())
        self.assertEqual(errors, {})
        self.assertEqual(set(responses), {"older", "newer"})
        run_command_mock.assert_called_once_with(["login", "--headless"], settings=settings, timeout_seconds=30)
        shared_session_id = responses["older"]["loginSessionId"]
        self.assertEqual(responses["newer"]["loginSessionId"], shared_session_id)
        self.assertIn(shared_session_id, jimeng_worker_module._active_login_sessions)
        self.assertEqual(jimeng_worker_module._active_login_sessions[shared_session_id][0], "shared-secret")

    def test_start_login_redacts_device_code_from_failed_command(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            settings = build_settings(Path(tmp_dir))
            with patch("uvpython_service.jimeng_worker.get_settings", return_value=settings):
                with patch(
                    "uvpython_service.jimeng_worker._run_jimeng_command",
                    return_value=JimengCommandResult(1, 'failed device_code="server-secret"', ""),
                ):
                    with self.assertRaises(RuntimeError) as raised:
                        start_jimeng_login()

        self.assertNotIn("server-secret", str(raised.exception))
        self.assertIn('device_code="[redacted]', str(raised.exception))

    def test_start_login_redacts_camel_case_device_code_from_failed_command(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            settings = build_settings(Path(tmp_dir))
            with patch("uvpython_service.jimeng_worker.get_settings", return_value=settings):
                with patch(
                    "uvpython_service.jimeng_worker._run_jimeng_command",
                    return_value=JimengCommandResult(1, '{"deviceCode":"server-secret"}', ""),
                ):
                    with self.assertRaises(RuntimeError) as raised:
                        start_jimeng_login()

        self.assertNotIn("server-secret", str(raised.exception))
        self.assertIn('"deviceCode":"[redacted]', str(raised.exception))

    def test_start_login_redacts_device_code_from_command_exceptions(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            settings = build_settings(Path(tmp_dir))
            with patch("uvpython_service.jimeng_worker.get_settings", return_value=settings):
                with patch(
                    "uvpython_service.jimeng_worker._run_jimeng_command",
                    side_effect=TimeoutError("timed out after device_code=server-secret"),
                ):
                    with self.assertRaises(RuntimeError) as raised:
                        start_jimeng_login()

        self.assertNotIn("server-secret", str(raised.exception))
        self.assertIn("device_code=[redacted]", str(raised.exception))

    def test_start_login_replaces_previous_device_flow_session(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            settings = build_settings(Path(tmp_dir))
            jimeng_worker_module._active_login_sessions["old-session"] = ("old-secret", float("inf"))
            with patch("uvpython_service.jimeng_worker.get_settings", return_value=settings):
                with patch(
                    "uvpython_service.jimeng_worker._run_jimeng_command",
                    return_value=JimengCommandResult(
                        0,
                        "verification_uri: https://example.com/login\nuser_code: NEW-CODE\ndevice_code: new-secret",
                        "",
                    ),
                ):
                    response = start_jimeng_login()

        self.assertNotIn("old-session", jimeng_worker_module._active_login_sessions)
        self.assertEqual(jimeng_worker_module._active_login_sessions[response["loginSessionId"]][0], "new-secret")

    def test_start_login_publishes_matching_expiry_timer(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            settings = build_settings(Path(tmp_dir))
            with patch("uvpython_service.jimeng_worker.get_settings", return_value=settings):
                with patch(
                    "uvpython_service.jimeng_worker._run_jimeng_command",
                    return_value=JimengCommandResult(
                        0,
                        '{"verificationUri":"https://example.com/login","userCode":"ABCD-EFGH","deviceCode":"server-secret"}',
                        "",
                    ),
                ):
                    with patch("uvpython_service.jimeng_worker.Timer") as timer_constructor:
                        response = start_jimeng_login()

        login_session_id = response["loginSessionId"]
        expires_at = jimeng_worker_module._active_login_sessions[login_session_id][1]
        expiry_timer = timer_constructor.return_value
        self.assertIs(jimeng_worker_module._login_expiry_timer, expiry_timer)
        self.assertEqual(timer_constructor.call_args.kwargs["args"], (login_session_id, expires_at))
        expiry_timer.start.assert_called_once_with()

    def test_activating_replacement_session_keeps_matching_timer(self) -> None:
        first_timer = MagicMock()
        second_timer = MagicMock()

        with patch("uvpython_service.jimeng_worker.Timer", side_effect=[first_timer, second_timer]):
            jimeng_worker_module._activate_jimeng_login_session("first-session", "secret-A", 100.0)
            jimeng_worker_module._activate_jimeng_login_session("second-session", "secret-B", 200.0)

        self.assertEqual(
            jimeng_worker_module._active_login_sessions,
            {"second-session": ("secret-B", 200.0)},
        )
        first_timer.cancel.assert_called_once_with()
        second_timer.cancel.assert_not_called()
        self.assertIs(jimeng_worker_module._login_expiry_timer, second_timer)

    def test_expiry_callback_keeps_a_replacement_login_session(self) -> None:
        jimeng_worker_module._active_login_sessions["login-session"] = ("new-secret", 200.0)

        jimeng_worker_module._expire_jimeng_login_session("login-session", 100.0)

        self.assertEqual(jimeng_worker_module._active_login_sessions["login-session"], ("new-secret", 200.0))

    def test_expiry_callback_removes_the_matching_login_session(self) -> None:
        jimeng_worker_module._active_login_sessions["login-session"] = ("server-secret", 100.0)

        jimeng_worker_module._expire_jimeng_login_session("login-session", 100.0)

        self.assertNotIn("login-session", jimeng_worker_module._active_login_sessions)

    def test_check_login_polls_device_flow_and_clears_completed_session(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            settings = build_settings(Path(tmp_dir))
            jimeng_worker_module._active_login_sessions["login-session"] = ("server-secret", float("inf"))
            with patch("uvpython_service.jimeng_worker.get_settings", return_value=settings):
                with patch(
                    "uvpython_service.jimeng_worker._run_jimeng_command",
                    return_value=JimengCommandResult(0, "authorized", ""),
                ) as run_command:
                    with patch(
                        "uvpython_service.jimeng_worker.get_jimeng_setup_status",
                        return_value={"status": "ready", "ready": True},
                    ):
                        response = check_jimeng_login("login-session", poll_seconds=20)

        self.assertTrue(response["ready"])
        self.assertNotIn("login-session", jimeng_worker_module._active_login_sessions)
        run_command.assert_called_once_with(
            ["login", "checklogin", "--device_code=server-secret", "--poll=20"],
            settings=settings,
            timeout_seconds=50,
        )

    def test_check_login_preserves_actionable_setup_status_after_authorization(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            settings = build_settings(Path(tmp_dir))
            actionable_status = {
                "status": "update_required",
                "ready": False,
                "message": "Install Dreamina CLI 1.4.15 or newer.",
            }
            jimeng_worker_module._active_login_sessions["login-session"] = ("server-secret", float("inf"))
            with patch("uvpython_service.jimeng_worker.get_settings", return_value=settings):
                with patch(
                    "uvpython_service.jimeng_worker._run_jimeng_command",
                    return_value=JimengCommandResult(0, "authorized", ""),
                ):
                    with patch(
                        "uvpython_service.jimeng_worker.get_jimeng_setup_status",
                        return_value=actionable_status,
                    ):
                        response = check_jimeng_login("login-session", poll_seconds=20)

        self.assertEqual(response, actionable_status)
        self.assertNotIn("login-session", jimeng_worker_module._active_login_sessions)


    def test_check_login_reports_pending_when_the_poll_times_out(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            settings = build_settings(Path(tmp_dir))
            jimeng_worker_module._active_login_sessions["login-session"] = ("server-secret", float("inf"))
            with patch("uvpython_service.jimeng_worker.get_settings", return_value=settings):
                with patch(
                    "uvpython_service.jimeng_worker._run_jimeng_command",
                    return_value=JimengCommandResult(1, "authsdk: login pending", ""),
                ):
                    response = check_jimeng_login("login-session", poll_seconds=20)

        self.assertEqual(response["status"], "pending")
        self.assertFalse(response["ready"])
        self.assertIn("login-session", jimeng_worker_module._active_login_sessions)  # The user can finish authorizing and check again.

    def test_check_login_redacts_device_code_from_pending_output(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            settings = build_settings(Path(tmp_dir))
            jimeng_worker_module._active_login_sessions["login-session"] = ("server-secret", float("inf"))
            with patch("uvpython_service.jimeng_worker.get_settings", return_value=settings):
                with patch(
                    "uvpython_service.jimeng_worker._run_jimeng_command",
                    return_value=JimengCommandResult(1, "failed --device_code=server-secret", ""),
                ):
                    response = check_jimeng_login("login-session", poll_seconds=20)

        self.assertNotIn("server-secret", response["message"])
        self.assertIn("--device_code=[redacted]", response["message"])

    def test_check_login_redacts_device_code_from_command_exceptions(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            settings = build_settings(Path(tmp_dir))
            jimeng_worker_module._active_login_sessions["login-session"] = ("server-secret", float("inf"))
            with patch("uvpython_service.jimeng_worker.get_settings", return_value=settings):
                with patch(
                    "uvpython_service.jimeng_worker._run_jimeng_command",
                    side_effect=TimeoutError("timed out for --device_code=server-secret"),
                ):
                    with self.assertRaisesRegex(RuntimeError, "--device_code=\\[redacted\\]") as raised:
                        check_jimeng_login("login-session", poll_seconds=20)

        self.assertNotIn("server-secret", str(raised.exception))

    def test_check_login_rejects_an_expired_device_flow_session(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            settings = build_settings(Path(tmp_dir))
            jimeng_worker_module._active_login_sessions["login-session"] = ("server-secret", float("inf"))
            with patch("uvpython_service.jimeng_worker.get_settings", return_value=settings):
                with patch(
                    "uvpython_service.jimeng_worker._run_jimeng_command",
                    return_value=JimengCommandResult(1, "登录已过期，请重新执行 dreamina login --headless", ""),
                ):
                    with self.assertRaisesRegex(ValueError, "expired"):
                        check_jimeng_login("login-session", poll_seconds=20)

        self.assertNotIn("login-session", jimeng_worker_module._active_login_sessions)


if __name__ == "__main__":
    unittest.main()
