from __future__ import annotations

import json
from email.message import Message
from http.client import HTTPResponse, IncompleteRead
from io import BytesIO
from urllib.error import HTTPError
import sys
import tempfile
import time
import unittest
from dataclasses import replace
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from uvpython_service.config import get_settings, get_tokenhub_settings
from uvpython_service.main import app
from uvpython_service.media import upload_media_to_tos, upload_video_to_tos
from uvpython_service.models import AssetInput, JobState, MediaInput, SeedanceJobPayload, TOKENHUB_MODEL_IDS, TOKENHUB_SEEDANCE20_MODEL_ID, TOKENHUB_SEEDANCE25_MODEL_ID
from uvpython_service.store import JobStore
from uvpython_service.tokenhub_seedance import TokenHubClient, TokenHubContent, TokenHubTask, TokenHubTemporaryError, build_request, validate_configuration
from uvpython_service.worker import _build_content, _execute_job, _poll_remote_task, _validate_payload, create_job, serialize_job


def settings(**overrides: object):
    return replace(get_settings(), tokenhub_api_key="tokenhub-test-secret", volcengine_access_key="tos-test-key", volcengine_secret_key="tos-test-secret", **overrides)


def payload(model_id: str = TOKENHUB_SEEDANCE20_MODEL_ID, **overrides: object) -> SeedanceJobPayload:
    values = dict(prompt="Make a film", model_id=model_id, variant="smart", ratio="16:9", duration=5, resolution="720p")
    values.update(overrides)
    return SeedanceJobPayload(**values)


def media(kind: str = "video", duration: float = 4) -> MediaInput:
    return MediaInput(f"ref.{kind}", f"{kind}/test", Path("/tmp/nonexistent-seedance-test"), 5, duration)


def job(model_id: str = TOKENHUB_SEEDANCE20_MODEL_ID) -> JobState:
    now = int(time.time() * 1000)
    return JobState("tokenhub-test", model_id, "Seedance", "smart", "Make a film", "IN_QUEUE", now, now)


class TokenHubRequestTests(unittest.TestCase):
    def test_text_request_for_both_models(self):
        for model_id in TOKENHUB_MODEL_IDS:
            with self.subTest(model_id=model_id):
                body = build_request(payload(model_id), [{"type": "text", "text": "Make a film"}])
                self.assertEqual(body, {"model": model_id, "prompt": "Make a film", "seconds": "5", "metadata": {"ratio": "16:9", "resolution": "720p", "generate_audio": False}})

    def test_all_input_media_are_signed_without_data_urls(self):
        source = payload(variant="reference", reference_images=[media("image")], reference_videos=[media()], reference_audios=[media("audio")])
        with patch("uvpython_service.worker.upload_media_to_tos", side_effect=lambda item, config, signed: f"https://assets.example/{item.file_name}?signature=secret") as upload:
            content = _build_content("missing-job", source, settings())
        self.assertEqual(upload.call_count, 3)
        self.assertEqual([item["role"] for item in content[1:]], ["reference_image", "reference_video", "reference_audio"])
        body = build_request(source, content)
        self.assertEqual(body["metadata"]["content"], content[1:])
        self.assertNotIn("data:", json.dumps(body))

    def test_single_frame_and_first_last_contract(self):
        for model_id in TOKENHUB_MODEL_IDS:
            for last in (False, True):
                with self.subTest(model=model_id, last=last):
                    source = payload(model_id, primary_image=media("image"), last_frame_image=media("image") if last else None)
                    with patch("uvpython_service.worker.upload_media_to_tos", return_value="https://assets.example/frame?signature=secret"):
                        body = build_request(source, _build_content("missing-job", source, settings()))
                    self.assertEqual("ratio" in body["metadata"], model_id == TOKENHUB_SEEDANCE20_MODEL_ID)
                    if last:
                        self.assertNotIn("images", body)
                        self.assertEqual([item["role"] for item in body["metadata"]["content"]], ["first_frame", "last_frame"])
                    else:
                        self.assertEqual(body["images"], ["https://assets.example/frame?signature=secret"])

    def test_edit_and_extend_contract_for_both_models(self):
        for model_id in TOKENHUB_MODEL_IDS:
            for variant in ("edit", "extend"):
                source = payload(model_id, variant=variant, duration=-1 if variant == "edit" else 5, reference_videos=[media()])
                _validate_payload(source)
                content = [{"type": "video_url", "role": "reference_video", "video_url": {"url": "https://assets.example/video"}}]
                body = build_request(source, content)
                self.assertEqual(body["metadata"]["content"], content)
                self.assertNotIn("omni_reference_task_type", json.dumps(body))
                if variant == "edit":
                    self.assertNotIn("seconds", body)
                    self.assertEqual(body["metadata"]["duration"], -1)
                else:
                    self.assertEqual(body["seconds"], "5")
                    self.assertNotIn("duration", body["metadata"])
                self.assertEqual("ratio" in body["metadata"], model_id == TOKENHUB_SEEDANCE20_MODEL_ID)

    def test_http_submission_and_task_id_alias(self):
        response = MagicMock()
        response.__enter__.return_value.read.return_value = b'{"task_id":"task-123"}'
        opener = MagicMock()
        opener.open.return_value = response
        with patch("uvpython_service.tokenhub_seedance.build_opener", return_value=opener):
            task = TokenHubClient(settings(tokenhub_base_url="https://gateway.example/")).create(payload(), [])
        self.assertEqual(task.id, "task-123")
        request = opener.open.call_args.args[0]
        self.assertEqual(request.full_url, "https://gateway.example/v1/videos")
        self.assertEqual(request.get_header("Authorization"), "Bearer tokenhub-test-secret")
        self.assertEqual(request.get_header("User-agent"), "Canva-Banana-Seedance")
        self.assertEqual(json.loads(request.data)["seconds"], "5")

    def test_http_errors_are_bounded_redacted_and_closed(self):
        body = BytesIO(b'{"error":{"message":"Bad prompt tokenhub-test-secret https://assets.example/?signature=secret"}}')
        error = HTTPError("https://gateway.example/v1/videos", 400, "Bad request", {}, body)
        opener = MagicMock()
        opener.open.side_effect = error
        with patch("uvpython_service.tokenhub_seedance.build_opener", return_value=opener), self.assertRaisesRegex(RuntimeError, "HTTP 400: Bad prompt ") as caught:
            TokenHubClient(settings()).create(payload(), [])
        self.assertNotIn("secret", str(caught.exception))
        self.assertTrue(body.closed)

    def test_task_ids_reject_path_segments(self):
        client = TokenHubClient(settings())
        for identifier in ("..", ".", "task/123", "task:123", "task.123", "_task123", ""):
            with patch.object(client, "_request", return_value={"id": identifier}), self.assertRaises(RuntimeError):
                client.create(payload(), [])

    def test_private_signed_upload_and_ark_public_upload_share_disk_path(self):
        with patch("uvpython_service.media.tos.TosClientV2") as factory:
            client = factory.return_value
            client.pre_signed_url.return_value.signed_url = "https://assets.example/private?signature=secret"
            result = upload_media_to_tos(media("image"), settings(), signed=True)
            self.assertEqual(result, "https://assets.example/private?signature=secret")
            self.assertEqual(client.put_object_from_file.call_args.kwargs["acl"].value, "private")
            self.assertEqual(client.put_object_from_file.call_args.kwargs["content_type"], "image/test")
            self.assertTrue(client.put_object_from_file.call_args.args[1].startswith("tokenhub_seedance_refs/"))
            self.assertEqual(client.put_object_from_file.call_args.args[2], "/tmp/nonexistent-seedance-test")
            self.assertGreaterEqual(client.pre_signed_url.call_args.kwargs["expires"], 3600)
            public = upload_video_to_tos(media(), settings())
            self.assertIn("acl", client.put_object_from_file.call_args.kwargs)
            self.assertTrue(public.startswith("https://"))


class TokenHubValidationTests(unittest.TestCase):
    def test_blank_url_and_invalid_poll_settings_use_defaults(self):
        with patch.dict("os.environ", {"TOKENHUB_BASE_URL": " ", "TOKENHUB_TIMEOUT_SECONDS": "", "TOKENHUB_POLL_INTERVAL_SECONDS": "invalid"}):
            config = get_settings.__wrapped__()
        self.assertEqual(config.tokenhub_base_url, "https://tokenhub.ctclouds.com/v1")
        self.assertEqual(config.tokenhub_timeout_seconds, 900)
        self.assertEqual(config.tokenhub_poll_interval_seconds, 5)

    def test_dev_settings_read_updated_and_cleared_keys_without_restarting(self):
        with tempfile.TemporaryDirectory() as root, patch.dict("os.environ", {
            "CANVA_BANANA_ENV_DIR": root, "CANVA_BANANA_DEV_TOKENHUB_ENV": "1",
        }), patch("uvpython_service.config._tokenhub_shell_settings", {"TOKENHUB_BASE_URL": "https://override.example/v1"}):
            env_file = Path(root) / ".env.local"
            cached = settings()
            for key, bucket in (("first-key", "first-bucket"), ("rotated-key", "rotated-bucket"), ("", "")):
                env_file.write_text(f"TOKENHUB_API_KEY={key}\nTOKENHUB_BASE_URL=https://file.example/v1\nVOLCENGINE_ACCESS_KEY={key}\nVOLCENGINE_SECRET_KEY={key}\nTOS_BUCKET_NAME={bucket}\nTOS_REGION=cn-shanghai\n")
                current = get_tokenhub_settings(cached)
                self.assertEqual(current.tokenhub_api_key, key)
                self.assertEqual(current.tokenhub_base_url, "https://override.example/v1")
                self.assertEqual(current.volcengine_access_key, key)
                self.assertEqual(current.volcengine_secret_key, key)
                self.assertEqual(current.tos_bucket_name, bucket or "seedance-assets")
                self.assertEqual(current.tos_region, "cn-shanghai")

    def test_duration_resolution_and_option_restrictions(self):
        for model_id in TOKENHUB_MODEL_IDS:
            max_duration = 30 if model_id == TOKENHUB_SEEDANCE25_MODEL_ID else 15
            _validate_payload(payload(model_id, duration=max_duration, output_format="mp4"))
            for overrides in ({"duration": -1}, {"duration": 3}, {"duration": max_duration + 1}, {"resolution": "4k"}, {"output_format": "mov"}, {"web_search": True}, {"return_last_frame": True}, {"watermark": True}, {"priority": 0}, {"draft": True}, {"camera_fixed": True}, {"variant": "reference", "reference_images": [AssetInput("asset-123")]}, {"variant": "edit", "reference_videos": [media()]}):
                with self.subTest(model=model_id, overrides=overrides), self.assertRaises(ValueError):
                    _validate_payload(payload(model_id, **overrides))

    def test_reference_limits_audio_only_and_clip_durations(self):
        for model_id, image_limit, video_limit, audio_limit in ((TOKENHUB_SEEDANCE20_MODEL_ID, 9, 3, 3), (TOKENHUB_SEEDANCE25_MODEL_ID, 30, 10, 10)):
            _validate_payload(payload(model_id, variant="reference", reference_images=[media("image")] * image_limit))
            for field, limit, kind in (("reference_images", image_limit, "image"), ("reference_videos", video_limit, "video"), ("reference_audios", audio_limit, "audio")):
                with self.subTest(model=model_id, field=field), self.assertRaises(ValueError):
                    _validate_payload(payload(model_id, variant="reference", **{field: [media(kind)] * (limit + 1)}))
        with self.assertRaises(ValueError):
            _validate_payload(payload(variant="reference", reference_audios=[media("audio")]))
        _validate_payload(payload(TOKENHUB_SEEDANCE25_MODEL_ID, variant="reference", reference_audios=[media("audio")]))
        for duration in (3, 31):
            with self.assertRaises(ValueError):
                _validate_payload(payload(TOKENHUB_SEEDANCE25_MODEL_ID, variant="edit", duration=-1, reference_videos=[media(duration=duration)]))
        with self.assertRaises(ValueError):
            _validate_payload(payload(variant="reference", reference_videos=[media(duration=8)] * 2))

    def test_configuration_fails_before_worker_creation(self):
        for key in ("tokenhub_api_key", "volcengine_access_key", "volcengine_secret_key"):
            config = replace(settings(), **{key: ""})
            source = payload(primary_image=media("image")) if key != "tokenhub_api_key" else payload()
            with patch("uvpython_service.worker.get_settings", return_value=config), patch("uvpython_service.worker.Thread") as thread, self.assertRaises(ValueError):
                create_job(source)
            thread.assert_not_called()
        self.assertEqual(validate_configuration(settings(tokenhub_base_url="https://gateway.example/v1/"), has_media=False), "https://gateway.example/v1")
        self.assertEqual(validate_configuration(settings(tokenhub_base_url="https://gateway.example/api/v1"), has_media=False), "https://gateway.example/api/v1")
        for url in ("http://gateway.example", "https://key@gateway.example", "https://gateway.example/v1?key=secret"):
            with self.assertRaises(ValueError):
                validate_configuration(settings(tokenhub_base_url=url), has_media=False)


class TokenHubLifecycleTests(unittest.TestCase):
    def test_truncated_status_response_is_retryable(self):
        client = TokenHubClient(settings())
        with patch("uvpython_service.tokenhub_seedance.build_opener") as opener:
            opener.return_value.open.return_value.__enter__.return_value.read.side_effect = IncompleteRead(b'{')
            with self.assertRaises(TokenHubTemporaryError):
                client.get("remote-1")

    def test_incomplete_content_length_is_retryable(self):
        client = TokenHubClient(settings())
        wire = b'HTTP/1.1 200 OK\r\nContent-Length: 40\r\n\r\n{"status":"queued"}'
        response = HTTPResponse(SimpleNamespace(makefile=lambda *_: BytesIO(wire)))
        response.begin()
        with patch("uvpython_service.tokenhub_seedance.build_opener") as opener:
            opener.return_value.open.return_value = response
            with self.assertRaisesRegex(TokenHubTemporaryError, "declared length"):
                client.get("remote-1")

    def test_status_mapping_and_invalid_responses(self):
        client = TokenHubClient(settings())
        for status in ("unknown", "queued", "in_progress"):
            with patch.object(client, "_request", return_value={"status": status}):
                self.assertEqual(client.get("remote-1").status, status)
        with patch.object(client, "_request", return_value={"status": "completed", "metadata": {"url": "https://cdn.example/result?signature=secret"}}):
            self.assertEqual(client.get("remote-1").content.video_url, "https://cdn.example/result?signature=secret")
        with patch.object(client, "_request", return_value={"status": "failed", "error": {"message": "tokenhub-test-secret https://cdn.example/?signature=secret"}}):
            self.assertEqual(client.get("remote-1").error, "[redacted] [redacted URL]")
        for response in ({"status": "completed"}, {"status": "completed", "metadata": {"url": "file:///etc/passwd"}}, {"status": "completed", "metadata": {"url": "https://user:pass@cdn.example/x"}}, {"status": "unexpected"}, {"status": {}}, {}):
            with patch.object(client, "_request", return_value=response), self.assertRaises(RuntimeError):
                client.get("remote-1")

    def test_shared_worker_completion_updates_and_cleanup(self):
        store = JobStore()
        store.create(job())
        updates = []
        store.subscribe("tokenhub-test", lambda value: updates.append(value.status))
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "frame.png"
            path.write_bytes(b"image")
            source = payload(primary_image=MediaInput(path.name, "image/png", path, 5))
            with (
                patch("uvpython_service.worker.job_store", store),
                patch("uvpython_service.worker.get_settings", return_value=settings()),
                patch("uvpython_service.worker.upload_media_to_tos", return_value="https://assets.example/frame"),
                patch.object(TokenHubClient, "create", return_value=TokenHubTask("remote-1")) as create,
                patch.object(TokenHubClient, "get", side_effect=[
                    TokenHubTask("remote-1", "queued"),
                    TokenHubTemporaryError("TokenHub request failed with HTTP 503"),
                    TokenHubTask("remote-1", "in_progress"),
                    TokenHubTask("remote-1", "succeeded", TokenHubContent("https://cdn.example/result?signature=secret")),
                ]),
                patch("uvpython_service.worker.time.sleep"),
            ):
                _execute_job("tokenhub-test", source)
                create.assert_called_once()
            self.assertFalse(path.exists())
        result = store.get("tokenhub-test")
        self.assertEqual(result.status, "COMPLETED")
        self.assertEqual(result.request_id, "remote-1")
        self.assertIn("IN_PROGRESS", updates)
        self.assertEqual(updates[-1], "COMPLETED")
        serialized = serialize_job(result, output_url="http://localhost/api/volcengine/jobs/tokenhub-test/output")
        self.assertNotIn("signature", json.dumps(serialized))
        self.assertIsNone(serialize_job(result)["outputUrl"])

    def test_worker_failure_redacts_errors_and_cleans_staged_media(self):
        store = JobStore()
        store.create(job())
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "frame.png"
            path.write_bytes(b"image")
            source = payload(primary_image=MediaInput(path.name, "image/png", path, 5))
            with patch("uvpython_service.worker.job_store", store), patch("uvpython_service.worker.get_settings", return_value=settings()), patch("uvpython_service.worker.upload_media_to_tos", side_effect=RuntimeError("tos-test-secret tokenhub-test-secret https://assets.example/?signature=secret")):
                _execute_job("tokenhub-test", source)
            self.assertFalse(path.exists())
        result = store.get("tokenhub-test")
        self.assertEqual(result.status, "FAILED")
        self.assertNotIn("secret", result.error)
        self.assertNotIn("signature", json.dumps(result.logs))

    def test_failed_and_timeout_jobs(self):
        for timed_out in (False, True):
            store = JobStore()
            store.create(job())
            client = TokenHubClient(settings())
            with patch("uvpython_service.worker.job_store", store), patch.object(client, "get", return_value=TokenHubTask("remote-1", "failed", error="provider failure")), patch("uvpython_service.worker.time.monotonic", side_effect=[0, 901] if timed_out else [0, 0, 0]):
                if timed_out:
                    with self.assertRaisesRegex(RuntimeError, "timed out"):
                        _poll_remote_task("tokenhub-test", client, "remote-1", settings())
                else:
                    _poll_remote_task("tokenhub-test", client, "remote-1", settings())
                    self.assertEqual(store.get("tokenhub-test").status, "FAILED")
                    self.assertTrue(store.get("tokenhub-test").remote_failure)

    def test_status_request_uses_remaining_budget_and_rejects_late_results(self):
        client = TokenHubClient(settings())
        result = TokenHubTask("remote-1", "succeeded", TokenHubContent("https://cdn.example/video"))
        with patch.object(client, "get", return_value=result) as get, patch("uvpython_service.worker.time.monotonic", side_effect=[0, 899, 901, 901]):
            with self.assertRaisesRegex(RuntimeError, "timed out"):
                _poll_remote_task("tokenhub-test", client, "remote-1", settings())
            get.assert_called_once_with("remote-1", timeout=1)


class TokenHubRouteTests(unittest.TestCase):
    def test_resume_reuses_the_original_task(self):
        store = JobStore()
        store.create(replace(job(), status="FAILED", remote_task_id="remote-1", request_id="remote-1", error="poll timed out"))
        headers = {"x-canva-banana-local-action": "volcengine-submit", "origin": "http://localhost:5173"}
        with (
            TestClient(app, client=("127.0.0.1", 50000)) as client,
            patch("uvpython_service.worker.job_store", store),
            patch("uvpython_service.worker.get_settings", return_value=settings()),
            patch("uvpython_service.worker.Thread") as thread,
        ):
            for _ in range(2):
                response = client.post("/api/volcengine/jobs/tokenhub-test/resume", headers=headers)
                self.assertEqual(response.status_code, 200, response.text)
                self.assertEqual(response.json()["requestId"], "remote-1")
                self.assertEqual(response.json()["status"], "IN_PROGRESS")
            thread.assert_called_once()

    def test_existing_trusted_route_queues_exact_tokenhub_models(self):
        config = replace(settings(), volcengine_access_key="", volcengine_secret_key="")
        headers = {"x-canva-banana-local-action": "volcengine-submit", "origin": "http://localhost:5173"}
        for model_id in TOKENHUB_MODEL_IDS:
            store = JobStore()
            with TestClient(app, client=("127.0.0.1", 50000)) as client, patch("uvpython_service.main.get_settings", return_value=config), patch("uvpython_service.worker.get_settings", return_value=config), patch("uvpython_service.worker.job_store", store), patch("uvpython_service.worker.Thread") as thread:
                response = client.post("/api/volcengine/jobs", data={"model_id": model_id, "prompt": "Make a film", "duration": "5"}, headers=headers)
                self.assertEqual(response.status_code, 200, response.text)
                self.assertEqual(response.json()["modelId"], model_id)
                self.assertEqual(response.json()["provider"], "volcengine")
                self.assertEqual(thread.call_args.kwargs["args"][1].model_id, model_id)
                self.assertEqual(client.post("/api/volcengine/jobs", data={"model_id": model_id, "prompt": "Make a film"}).status_code, 403)
                self.assertEqual(client.post("/api/volcengine/jobs", data={"model_id": model_id, "prompt": "Make a film", "web_search": "true"}, headers=headers).status_code, 400)
                self.assertEqual(client.post("/api/volcengine/jobs", data={"model_id": model_id, "prompt": "Make a film", "resolution": "4k"}, headers=headers).status_code, 400)


class TokenHubOutputTests(unittest.TestCase):
    def test_result_proxy_rejects_html_and_labels_binary_mp4(self):
        from uvpython_service.main import _stream_pinned_remote_asset
        from fastapi import HTTPException

        headers = Message()
        headers["Content-Type"] = "text/html"
        headers["Content-Disposition"] = "attachment; filename=upstream.txt"
        upstream = SimpleNamespace(headers=headers, close=MagicMock())
        with patch("uvpython_service.main._open_pinned_remote_asset", return_value=upstream):
            with self.assertRaises(HTTPException):
                _stream_pinned_remote_asset("https://cdn.example/result", "8.8.8.8", provider="TokenHub")
            upstream.close.assert_called_once()
            headers.replace_header("Content-Type", "application/octet-stream")
            result = _stream_pinned_remote_asset("https://cdn.example/result", "8.8.8.8", provider="TokenHub")
            self.assertEqual(result.media_type, "video/mp4")
            self.assertEqual(result.headers["x-content-type-options"], "nosniff")
            self.assertEqual(result.headers["content-disposition"], "inline; filename=seedance.mp4")

    def test_proxy_pins_public_ip_and_keeps_signed_url_server_side(self):
        completed = replace(job(), status="COMPLETED", output_url="https://cdn.example/result?signature=secret")
        with TestClient(app, client=("127.0.0.1", 50000)) as client, patch("uvpython_service.main.job_store.get", return_value=completed), patch("uvpython_service.main._resolve_public_remote_ip", return_value="8.8.8.8"), patch("uvpython_service.main._stream_pinned_remote_asset", return_value=SimpleNamespace()) as stream:
            from uvpython_service.main import download_seedance_job_output
            download_seedance_job_output(completed.id)
            stream.assert_called_once_with(completed.output_url, "8.8.8.8", provider="TokenHub")
            result = client.get(f"/api/volcengine/jobs/{completed.id}")
            self.assertEqual(result.status_code, 200)
            self.assertNotIn("signature", result.text)
        for url in ("http://cdn.example/result", "https://127.0.0.1/result", "https://cdn.example/result"):
            with TestClient(app) as client, patch("uvpython_service.main.job_store.get", return_value=replace(completed, output_url=url)), patch("uvpython_service.main._resolve_public_remote_ip", return_value=None):
                self.assertEqual(client.get(f"/api/volcengine/jobs/{completed.id}/output").status_code, 403)

    def test_result_request_has_no_tokenhub_authorization_and_rejects_redirect(self):
        from uvpython_service.main import _open_pinned_remote_asset
        from fastapi import HTTPException
        response = SimpleNamespace(status=302, close=MagicMock())
        with patch("uvpython_service.main._PinnedHTTPSConnection") as connection:
            connection.return_value.getresponse.return_value = response
            with self.assertRaises(HTTPException):
                _open_pinned_remote_asset("https://cdn.example/result?signature=secret", "8.8.8.8", provider="TokenHub")
            headers = connection.return_value.request.call_args.kwargs["headers"]
            self.assertNotIn("Authorization", headers)
            self.assertEqual(headers["Host"], "cdn.example")


if __name__ == "__main__":
    unittest.main()
