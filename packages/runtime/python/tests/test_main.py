from __future__ import annotations

import sys
import unittest
from email.message import Message
from pathlib import Path
from unittest.mock import patch

from fastapi import HTTPException
from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect

PYTHON_PROJECT_ROOT = Path(__file__).resolve().parents[1]  # Shared runtime Python project.
sys.path.insert(0, str(PYTHON_PROJECT_ROOT / "src"))  # Import the backend package without installing it.

from uvpython_service.main import _open_pinned_remote_asset, _read_uploads, app
from uvpython_service.models import JobState
from uvpython_service.store import JobStore

LOCAL_TEST_CLIENT = ("127.0.0.1", 50000)  # Simulate same-machine requests for protected setup actions.
REMOTE_TEST_CLIENT = ("192.168.1.20", 50000)  # Simulate a LAN caller reaching a 0.0.0.0-bound backend.
DESKTOP_AUTH_TOKEN = "desktop-test-token"  # Test nonce for packaged desktop-origin requests.


def build_job_state(**overrides: object) -> JobState:
    payload = {
        "id": "job-1",
        "model_id": "doubao-seedance-2-0-260128",
        "model_label": "Seedance 2",
        "variant": "smart",
        "prompt": "test prompt",
        "status": "COMPLETED",
        "created_at": 1,
        "updated_at": 2,
        "logs": ["Video ready"],
        "output_url": "https://example.com/output.mp4",
        "last_frame_url": "https://example.com/last-frame.png",
    }
    payload.update(overrides)
    return JobState(**payload)  # Keep the fake job shape aligned with the API serializer.


class FakeUpstreamResponse:
    def __init__(self, body: bytes, *, content_type: str = "video/mp4") -> None:
        self._body = body
        self._offset = 0
        self._closed = False
        self.status = 200
        self.headers = Message()
        self.headers["Content-Type"] = content_type
        self.headers["Content-Length"] = str(len(body))
        self.headers["Content-Disposition"] = 'attachment; filename="result.mp4"'

    def read(self, size: int = -1) -> bytes:
        if self._offset >= len(self._body):
            return b""
        if size < 0:
            size = len(self._body) - self._offset
        chunk = self._body[self._offset:self._offset + size]
        self._offset += size
        return chunk  # Mimic urllib's incremental stream reads.

    def close(self) -> None:
        self._closed = True  # Track close calls so the proxy can release the upstream response.


class FakePinnedConnection:
    instances: list["FakePinnedConnection"] = []

    def __init__(self, host: str, pinned_ip: str, **kwargs: object) -> None:
        self.host = host
        self.pinned_ip = pinned_ip
        self.kwargs = kwargs
        self.requests: list[tuple[str, str, dict[str, str]]] = []
        FakePinnedConnection.instances.append(self)  # Preserve constructor details for assertions.

    def request(self, method: str, path: str, *, headers: dict[str, str]) -> None:
        self.requests.append((method, path, headers))  # Capture the outbound request without opening a socket.

    def getresponse(self) -> FakeUpstreamResponse:
        return FakeUpstreamResponse(b"video")

    def close(self) -> None:
        pass  # The success path keeps ownership with the streaming response.


class FakeUpload:
    def __init__(self, file_name: str, content: bytes) -> None:
        self.filename = file_name
        self.content_type = "image/png"
        self._content = content
        self._offset = 0
        self.closed = False

    async def seek(self, offset: int) -> None:
        self._offset = offset

    async def read(self, size: int) -> bytes:
        chunk = self._content[self._offset:self._offset + size]
        self._offset += len(chunk)
        return chunk

    async def close(self) -> None:
        self.closed = True


class UploadStagingTests(unittest.IsolatedAsyncioTestCase):
    async def test_read_uploads_cleans_staged_items_when_a_later_upload_fails(self) -> None:
        first_upload = FakeUpload("first.png", b"first")
        second_upload = FakeUpload("second.png", b"second")
        staged_paths: list[Path] = []

        def capture_then_fail(path: Path) -> float:
            staged_paths.append(path)
            if len(staged_paths) == 2:
                raise ValueError("invalid second upload")
            return 5.0

        with patch("uvpython_service.main.probe_media_duration_seconds", side_effect=capture_then_fail):
            with self.assertRaisesRegex(ValueError, "invalid second upload"):
                await _read_uploads(
                    [first_upload, second_upload],  # type: ignore[list-item]
                    should_probe_duration=True,
                    media_label="reference video",
                )

        self.assertEqual(len(staged_paths), 2)
        self.assertTrue(all(not path.exists() for path in staged_paths))


class MainApiTests(unittest.TestCase):
    def test_job_response_exposes_proxy_urls_and_provider_urls(self) -> None:
        client = TestClient(app)

        with patch("uvpython_service.main.job_store.get", return_value=build_job_state()):
            response = client.get("/api/volcengine/jobs/job-1")

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["outputUrl"], "http://testserver/api/volcengine/jobs/job-1/output")
        self.assertEqual(payload["providerOutputUrl"], "https://example.com/output.mp4")
        self.assertEqual(payload["lastFrameUrl"], "http://testserver/api/volcengine/jobs/job-1/last-frame")
        self.assertEqual(payload["providerLastFrameUrl"], "https://example.com/last-frame.png")

    def test_output_proxy_streams_remote_video(self) -> None:
        client = TestClient(app)
        upstream_response = FakeUpstreamResponse(b"video-bytes")

        with patch("uvpython_service.main.job_store.get", return_value=build_job_state()):
            with patch("uvpython_service.main.urlopen", return_value=upstream_response):
                response = client.get("/api/volcengine/jobs/job-1/output")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.content, b"video-bytes")
        self.assertEqual(response.headers["content-type"], "video/mp4")
        self.assertEqual(response.headers["content-disposition"], 'attachment; filename="result.mp4"')
        self.assertTrue(upstream_response._closed)

    def test_volcengine_job_submission_rejects_missing_local_action_header(self) -> None:
        client = TestClient(app, client=LOCAL_TEST_CLIENT)

        with patch("uvpython_service.main.create_job") as create_seedance_job:
            response = client.post(
                "/api/volcengine/jobs",
                data={"prompt": "make a video"},
                headers={"Origin": "http://localhost:5173"},
            )

        self.assertEqual(response.status_code, 403)
        create_seedance_job.assert_not_called()

    def test_volcengine_job_submission_rejects_cross_site_origin(self) -> None:
        client = TestClient(app, client=LOCAL_TEST_CLIENT)

        with patch("uvpython_service.main.create_job") as create_seedance_job:
            response = client.post(
                "/api/volcengine/jobs",
                data={"prompt": "make a video"},
                headers={
                    "Origin": "https://example.com",
                    "X-Canva-Banana-Local-Action": "volcengine-submit",
                },
            )

        self.assertEqual(response.status_code, 403)
        create_seedance_job.assert_not_called()

    def test_volcengine_job_submission_rejects_remote_client_without_origin(self) -> None:
        client = TestClient(app, client=REMOTE_TEST_CLIENT)

        with patch("uvpython_service.main.create_job") as create_seedance_job:
            response = client.post(
                "/api/volcengine/jobs",
                data={"prompt": "make a video"},
                headers={"X-Canva-Banana-Local-Action": "volcengine-submit"},
            )

        self.assertEqual(response.status_code, 403)
        create_seedance_job.assert_not_called()

    def test_volcengine_job_submission_allows_trusted_local_frontend(self) -> None:
        client = TestClient(app, client=LOCAL_TEST_CLIENT)
        job = build_job_state(status="IN_QUEUE", output_url=None, last_frame_url=None)

        with patch("uvpython_service.main.create_job", return_value=job) as create_seedance_job:
            response = client.post(
                "/api/volcengine/jobs",
                data={
                    "prompt": "make a video",
                    "model_id": "doubao-seedance-2-0-260128",
                    "variant": "smart",
                    "ratio": "16:9",
                    "duration": "5",
                    "resolution": "720p",
                    "generate_audio": "false",
                    "camera_fixed": "false",
                },
                headers={
                    "Origin": "http://localhost:5173",
                    "X-Canva-Banana-Local-Action": "volcengine-submit",
                },
            )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["provider"], "volcengine")
        create_seedance_job.assert_called_once()

    def test_volcengine_job_submission_accepts_mini_model_and_4k_resolution(self) -> None:
        client = TestClient(app, client=LOCAL_TEST_CLIENT)
        job = build_job_state(status="IN_QUEUE", output_url=None, last_frame_url=None)

        with patch("uvpython_service.main.create_job", return_value=job) as create_seedance_job:
            for model_id, resolution in (
                ("doubao-seedance-2-0-mini-260615", "720p"),
                ("doubao-seedance-2-0-260128", "4k"),
            ):
                response = client.post(
                    "/api/volcengine/jobs",
                    data={
                        "prompt": "make a video",
                        "model_id": model_id,
                        "variant": "smart",
                        "ratio": "16:9",
                        "duration": "5",
                        "resolution": resolution,
                        "generate_audio": "false",
                        "camera_fixed": "false",
                    },
                    headers={
                        "Origin": "http://localhost:5173",
                        "X-Canva-Banana-Local-Action": "volcengine-submit",
                    },
                )
                self.assertEqual(response.status_code, 200)

        self.assertEqual(create_seedance_job.call_count, 2)  # Both model/resolution pairs pass the submit whitelist.

    def test_volcengine_job_submission_accepts_seedance25_output_format_and_auto_duration(self) -> None:
        client = TestClient(app, client=LOCAL_TEST_CLIENT)
        job = build_job_state(status="IN_QUEUE", output_url=None, last_frame_url=None)

        with patch("uvpython_service.main.create_job", return_value=job) as create_seedance_job:
            response = client.post(
                "/api/volcengine/jobs",
                data={
                    "prompt": "make a video",
                    "model_id": "doubao-seedance-2-5-260628",
                    "variant": "smart",
                    "ratio": "adaptive",
                    "duration": "-1",
                    "resolution": "720p",
                    "output_format": "mov",
                    "generate_audio": "false",
                },
                headers={
                    "Origin": "http://localhost:5173",
                    "X-Canva-Banana-Local-Action": "volcengine-submit",
                },
            )

        self.assertEqual(response.status_code, 200)
        create_seedance_job.assert_called_once()
        payload = create_seedance_job.call_args.args[0]
        self.assertEqual(payload.duration, -1)  # -1 means the model auto-selects the duration.
        self.assertEqual(payload.output_format, "mov")

    def test_volcengine_job_submission_rejects_unknown_output_format(self) -> None:
        client = TestClient(app, client=LOCAL_TEST_CLIENT)

        with patch("uvpython_service.main.create_job") as create_seedance_job:
            response = client.post(
                "/api/volcengine/jobs",
                data={
                    "prompt": "make a video",
                    "model_id": "doubao-seedance-2-5-260628",
                    "variant": "smart",
                    "ratio": "adaptive",
                    "duration": "-1",
                    "output_format": "webm",
                },
                headers={
                    "Origin": "http://localhost:5173",
                    "X-Canva-Banana-Local-Action": "volcengine-submit",
                },
            )

        self.assertEqual(response.status_code, 400)
        create_seedance_job.assert_not_called()

    def test_volcengine_job_submission_accepts_edit_and_extend_variants(self) -> None:
        client = TestClient(app, client=LOCAL_TEST_CLIENT)
        job = build_job_state(status="IN_QUEUE", output_url=None, last_frame_url=None)

        with patch("uvpython_service.main.create_job", return_value=job) as create_seedance_job:
            for variant in ("edit", "extend"):
                response = client.post(
                    "/api/volcengine/jobs",
                    data={
                        "prompt": "make a video",
                        "model_id": "doubao-seedance-2-0-260128",
                        "variant": variant,
                        "ratio": "16:9",
                        "duration": "5",
                        "resolution": "720p",
                        "generate_audio": "false",
                        "camera_fixed": "false",
                    },
                    headers={
                        "Origin": "http://localhost:5173",
                        "X-Canva-Banana-Local-Action": "volcengine-submit",
                    },
                )
                self.assertEqual(response.status_code, 200)

        self.assertEqual(create_seedance_job.call_count, 2)  # Both variants pass the submit whitelist.

    def test_volcengine_job_submission_rejects_packaged_desktop_null_origin_without_token(self) -> None:
        client = TestClient(app, client=LOCAL_TEST_CLIENT)

        with patch("uvpython_service.main.create_job") as create_seedance_job:
            response = client.post(
                "/api/volcengine/jobs",
                data={"prompt": "make a video"},
                headers={
                    "Origin": "null",
                    "X-Canva-Banana-Local-Action": "volcengine-submit",
                },
            )

        self.assertEqual(response.status_code, 403)
        create_seedance_job.assert_not_called()

    def test_volcengine_job_submission_allows_packaged_desktop_null_origin_with_token(self) -> None:
        client = TestClient(app, client=LOCAL_TEST_CLIENT)
        job = build_job_state(status="IN_QUEUE", output_url=None, last_frame_url=None)

        with patch.dict("os.environ", {"CANVA_BANANA_DESKTOP_AUTH_TOKEN": DESKTOP_AUTH_TOKEN}):
            with patch("uvpython_service.main.create_job", return_value=job) as create_seedance_job:
                response = client.post(
                    "/api/volcengine/jobs",
                    data={
                        "prompt": "make a video",
                        "model_id": "doubao-seedance-2-0-260128",
                        "variant": "smart",
                        "ratio": "16:9",
                        "duration": "5",
                        "resolution": "720p",
                        "generate_audio": "false",
                        "camera_fixed": "false",
                    },
                    headers={
                        "Origin": "null",
                        "X-Canva-Banana-Local-Action": "volcengine-submit",
                        "X-Canva-Banana-Desktop-Token": DESKTOP_AUTH_TOKEN,
                    },
                )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["provider"], "volcengine")
        create_seedance_job.assert_called_once()

    def test_canvas_setup_status_requires_local_action_header(self) -> None:
        client = TestClient(app, client=LOCAL_TEST_CLIENT)

        with patch("uvpython_service.main.get_canvas_setup_status") as get_status:
            response = client.get("/api/jimeng/canvas/setup/status", headers={"Origin": "http://localhost:5173"})

        self.assertEqual(response.status_code, 403)
        get_status.assert_not_called()

    def test_canvas_setup_status_allows_trusted_local_frontend(self) -> None:
        client = TestClient(app, client=LOCAL_TEST_CLIENT)
        setup_status = {"status": "ready", "ready": True}

        with patch("uvpython_service.main.get_canvas_setup_status", return_value=setup_status), patch("uvpython_service.main.list_legacy_cli_installations", return_value=[]):
            response = client.get(
                "/api/jimeng/canvas/setup/status",
                headers={
                    "Origin": "http://localhost:5173",
                    "X-Canva-Banana-Local-Action": "jimeng-setup",
                },
            )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {**setup_status, "legacyCliInstallations": []})

    def test_open_pinned_remote_asset_uses_explicit_url_port(self) -> None:
        FakePinnedConnection.instances = []

        with patch("uvpython_service.main._PinnedHTTPSConnection", FakePinnedConnection):
            _open_pinned_remote_asset("https://example.com:8443/output.mp4?download=1", "93.184.216.34", provider="TokenHub")

        connection = FakePinnedConnection.instances[0]
        self.assertEqual(connection.host, "example.com")
        self.assertEqual(connection.pinned_ip, "93.184.216.34")
        self.assertEqual(connection.kwargs["port"], 8443)
        self.assertEqual(connection.requests[0][1], "/output.mp4?download=1")
        self.assertEqual(connection.requests[0][2]["Host"], "example.com:8443")

    def test_open_pinned_tokenhub_asset_maps_connection_errors_to_502(self) -> None:
        for method in ("request", "getresponse"):
            with self.subTest(method=method):
                error = OSError("Connection failed")
                with patch("uvpython_service.main._PinnedHTTPSConnection", FakePinnedConnection):
                    with patch.object(FakePinnedConnection, method, side_effect=error):
                        with patch.object(FakePinnedConnection, "close") as close:
                            with self.assertRaises(HTTPException) as raised:
                                _open_pinned_remote_asset("https://example.com/output.mp4", "93.184.216.34", provider="TokenHub")

                self.assertEqual(raised.exception.status_code, 502)
                self.assertEqual(raised.exception.detail, "TokenHub asset download failed")
                self.assertIs(raised.exception.__cause__, error)
                close.assert_called_once()

    def test_canvas_setup_install_rejects_missing_local_action_header(self) -> None:
        client = TestClient(app, client=LOCAL_TEST_CLIENT)

        with patch("uvpython_service.main.install_canvas_cli") as install_cli:
            response = client.post("/api/jimeng/canvas/setup/install", headers={"Origin": "http://localhost:5173"})

        self.assertEqual(response.status_code, 403)
        install_cli.assert_not_called()

    def test_canvas_setup_install_rejects_cross_site_origin(self) -> None:
        client = TestClient(app, client=LOCAL_TEST_CLIENT)

        with patch("uvpython_service.main.install_canvas_cli") as install_cli:
            response = client.post(
                "/api/jimeng/canvas/setup/install",
                headers={
                    "Origin": "https://example.com",
                    "X-Canva-Banana-Local-Action": "jimeng-setup",
                },
            )

        self.assertEqual(response.status_code, 403)
        install_cli.assert_not_called()

    def test_canvas_setup_install_allows_trusted_local_frontend(self) -> None:
        client = TestClient(app, client=LOCAL_TEST_CLIENT)
        install_result = {"status": "ok", "message": "installed"}

        with patch("uvpython_service.main.install_canvas_cli", return_value=install_result):
            response = client.post(
                "/api/jimeng/canvas/setup/install",
                headers={
                    "Origin": "http://localhost:5173",
                    "X-Canva-Banana-Local-Action": "jimeng-setup",
                },
            )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), install_result)

    def test_canvas_setup_install_allows_packaged_desktop_file_origin_with_token(self) -> None:
        client = TestClient(app, client=LOCAL_TEST_CLIENT)
        install_result = {"status": "ok", "message": "installed"}

        with patch.dict("os.environ", {"CANVA_BANANA_DESKTOP_AUTH_TOKEN": DESKTOP_AUTH_TOKEN}):
            with patch("uvpython_service.main.install_canvas_cli", return_value=install_result) as install_cli:
                response = client.post(
                    "/api/jimeng/canvas/setup/install",
                    headers={
                        "Origin": "file://",
                        "X-Canva-Banana-Local-Action": "jimeng-setup",
                        "X-Canva-Banana-Desktop-Token": DESKTOP_AUTH_TOKEN,
                    },
                )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), install_result)
        install_cli.assert_called_once()

    def test_canvas_setup_install_rejects_remote_client_with_packaged_origin(self) -> None:
        client = TestClient(app, client=REMOTE_TEST_CLIENT)

        with patch("uvpython_service.main.install_canvas_cli") as install_cli:
            response = client.post(
                "/api/jimeng/canvas/setup/install",
                headers={
                    "Origin": "null",
                    "X-Canva-Banana-Local-Action": "jimeng-setup",
                },
            )

        self.assertEqual(response.status_code, 403)
        install_cli.assert_not_called()

    def test_canvas_setup_install_rejects_file_origin_with_host(self) -> None:
        client = TestClient(app, client=LOCAL_TEST_CLIENT)

        with patch("uvpython_service.main.install_canvas_cli") as install_cli:
            response = client.post(
                "/api/jimeng/canvas/setup/install",
                headers={
                    "Origin": "file://example.com",
                    "X-Canva-Banana-Local-Action": "jimeng-setup",
                },
            )

        self.assertEqual(response.status_code, 403)
        install_cli.assert_not_called()

    def test_canvas_setup_install_rejects_remote_client_without_origin(self) -> None:
        client = TestClient(app, client=REMOTE_TEST_CLIENT)

        with patch("uvpython_service.main.install_canvas_cli") as install_cli:
            response = client.post(
                "/api/jimeng/canvas/setup/install",
                headers={"X-Canva-Banana-Local-Action": "jimeng-setup"},
            )

        self.assertEqual(response.status_code, 403)
        install_cli.assert_not_called()

    def test_canvas_setup_install_rejects_remote_client_with_spoofed_origin(self) -> None:
        client = TestClient(app, client=REMOTE_TEST_CLIENT)

        with patch("uvpython_service.main.install_canvas_cli") as install_cli:
            response = client.post(
                "/api/jimeng/canvas/setup/install",
                headers={
                    "Origin": "http://localhost:5173",
                    "X-Canva-Banana-Local-Action": "jimeng-setup",
                },
            )

        self.assertEqual(response.status_code, 403)
        install_cli.assert_not_called()

    def test_canvas_setup_login_uses_same_local_request_guard(self) -> None:
        client = TestClient(app, client=LOCAL_TEST_CLIENT)

        with patch("uvpython_service.main.start_canvas_login") as start_login:
            response = client.post(
                "/api/jimeng/canvas/setup/login",
                headers={
                    "Origin": "https://example.com",
                    "X-Canva-Banana-Local-Action": "jimeng-setup",
                },
            )

        self.assertEqual(response.status_code, 403)
        start_login.assert_not_called()

    def test_canvas_setup_login_check_forwards_opaque_session(self) -> None:
        client = TestClient(app, client=LOCAL_TEST_CLIENT)
        result = {"status": "ready", "ready": True, "message": "Jimeng login completed"}

        with patch("uvpython_service.main.check_canvas_login", return_value=result) as check_login:
            response = client.post(
                "/api/jimeng/canvas/setup/login/check?login_session_id=opaque-session&poll=5",
                headers={
                    "Origin": "http://localhost:5173",
                    "X-Canva-Banana-Local-Action": "jimeng-setup",
                },
            )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), result)
        check_login.assert_called_once_with("opaque-session", poll_seconds=5)

    def test_job_websocket_streams_initial_snapshot_and_terminal_update_before_close(self) -> None:
        client = TestClient(app)
        fresh_store = JobStore()
        fresh_store.create(build_job_state(
            status="IN_PROGRESS",
            logs=["Preparing Volcengine request"],
            output_url=None,
            last_frame_url=None,
        ))

        with patch("uvpython_service.main.job_store", fresh_store):
            with client.websocket_connect("/api/volcengine/jobs/job-1/ws") as websocket:
                initial_payload = websocket.receive_json()
                self.assertEqual(initial_payload["status"], "IN_PROGRESS")
                self.assertEqual(initial_payload["logs"], ["Preparing Volcengine request"])

                fresh_store.append_log("job-1", "Task submitted to Volcengine", updated_at=3)
                log_payload = websocket.receive_json()
                self.assertEqual(log_payload["logs"], ["Preparing Volcengine request", "Task submitted to Volcengine"])

                fresh_store.update(
                    "job-1",
                    status="COMPLETED",
                    output_url="https://example.com/output.mp4",
                    last_frame_url="https://example.com/last-frame.png",
                    updated_at=4,
                )
                final_payload = websocket.receive_json()
                self.assertEqual(final_payload["status"], "COMPLETED")
                self.assertEqual(final_payload["outputUrl"], "http://testserver/api/volcengine/jobs/job-1/output")
                self.assertEqual(final_payload["lastFrameUrl"], "http://testserver/api/volcengine/jobs/job-1/last-frame")

                with self.assertRaises(WebSocketDisconnect) as close_error:
                    websocket.receive_json()

        self.assertEqual(close_error.exception.code, 1000)

    def test_missing_job_websocket_closes_with_not_found_code(self) -> None:
        client = TestClient(app)
        fresh_store = JobStore()

        with patch("uvpython_service.main.job_store", fresh_store):
            with client.websocket_connect("/api/volcengine/jobs/missing-job/ws") as websocket:
                with self.assertRaises(WebSocketDisconnect) as close_error:
                    websocket.receive_json()

        self.assertEqual(close_error.exception.code, 1008)

if __name__ == "__main__":
    unittest.main()
