from __future__ import annotations

import sys
import tempfile
import unittest
from email.message import Message
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from fastapi import HTTPException
from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect

PYTHON_APP_ROOT = Path(__file__).resolve().parents[2]  # Reach apps/python-backend from backend/tests.
sys.path.insert(0, str(PYTHON_APP_ROOT / "backend" / "src"))  # Import the backend package without installing it.

from uvpython_service.main import _open_pinned_remote_asset, app
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

    def test_jimeng_output_proxy_preserves_local_video_mime_type(self) -> None:
        client = TestClient(app)
        with tempfile.TemporaryDirectory() as tmp_dir:
            output_path = Path(tmp_dir) / "result.webm"
            output_path.write_bytes(b"webm-bytes")
            job = build_job_state(
                model_id="jimeng-cli/seedance-2",
                model_label="Seedance 2 (JM CLI)",
                output_url=str(output_path),
                last_frame_url=None,
            )

            with patch("uvpython_service.main.jimeng_job_store.get", return_value=job):
                with patch("uvpython_service.main.get_settings", return_value=SimpleNamespace(jimeng_work_dir=Path(tmp_dir))):
                    response = client.get("/api/jimeng/jobs/job-1/output")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.content, b"webm-bytes")
        self.assertEqual(response.headers["content-type"], "video/webm")

    def test_jimeng_output_proxy_rejects_local_video_outside_work_dir(self) -> None:
        client = TestClient(app)
        with tempfile.TemporaryDirectory() as tmp_dir:
            with tempfile.TemporaryDirectory() as work_dir:
                output_path = Path(tmp_dir) / "private.mp4"
                output_path.write_bytes(b"private-video")
                job = build_job_state(
                    model_id="jimeng-cli/seedance-2",
                    model_label="Seedance 2 (JM CLI)",
                    output_url=str(output_path),
                    last_frame_url=None,
                )

                with patch("uvpython_service.main.jimeng_job_store.get", return_value=job):
                    with patch("uvpython_service.main.get_settings", return_value=SimpleNamespace(jimeng_work_dir=Path(work_dir))):
                        response = client.get("/api/jimeng/jobs/job-1/output")

        self.assertEqual(response.status_code, 403)

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

    def test_clear_jimeng_cache_endpoint_returns_cleanup_result(self) -> None:
        client = TestClient(app, client=LOCAL_TEST_CLIENT)
        cleanup_result = {
            "status": "ok",
            "deletedFiles": 1,
            "bytesFreed": 1024,
            "workDir": "/tmp/jimeng",
            "errors": [],
        }

        with patch("uvpython_service.main.clear_jimeng_cache", return_value=cleanup_result):
            response = client.delete(
                "/api/jimeng/cache",
                headers={
                    "Origin": "http://localhost:5173",
                    "X-Canva-Banana-Local-Action": "jimeng-setup",
                },
            )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), cleanup_result)

    def test_jimeng_setup_status_requires_local_action_header(self) -> None:
        client = TestClient(app, client=LOCAL_TEST_CLIENT)

        with patch("uvpython_service.main.get_jimeng_setup_status") as get_status:
            response = client.get("/api/jimeng/setup/status", headers={"Origin": "http://localhost:5173"})

        self.assertEqual(response.status_code, 403)
        get_status.assert_not_called()

    def test_jimeng_setup_status_allows_trusted_local_frontend(self) -> None:
        client = TestClient(app, client=LOCAL_TEST_CLIENT)
        setup_status = {"status": "ready", "ready": True}

        with patch("uvpython_service.main.get_jimeng_setup_status", return_value=setup_status):
            response = client.get(
                "/api/jimeng/setup/status",
                headers={
                    "Origin": "http://localhost:5173",
                    "X-Canva-Banana-Local-Action": "jimeng-setup",
                },
            )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), setup_status)

    def test_jimeng_health_rejects_remote_client(self) -> None:
        client = TestClient(app, client=REMOTE_TEST_CLIENT)

        with patch("uvpython_service.main.check_jimeng_health") as check_health:
            response = client.get(
                "/api/jimeng/health",
                headers={"X-Canva-Banana-Local-Action": "jimeng-setup"},
            )

        self.assertEqual(response.status_code, 403)
        check_health.assert_not_called()

    def test_jimeng_remote_output_proxy_rejects_private_hosts(self) -> None:
        client = TestClient(app)
        job = build_job_state(
            model_id="jimeng-cli/seedance-2",
            model_label="Seedance 2 (JM CLI)",
            output_url="http://127.0.0.1/private.mp4",
            last_frame_url=None,
        )

        with patch("uvpython_service.main.jimeng_job_store.get", return_value=job):
            with patch("uvpython_service.main.urlopen") as open_url:
                response = client.get("/api/jimeng/jobs/job-1/output")

        self.assertEqual(response.status_code, 403)
        open_url.assert_not_called()

    def test_jimeng_remote_output_proxy_fetches_pinned_public_ip(self) -> None:
        client = TestClient(app)
        job = build_job_state(
            model_id="jimeng-cli/seedance-2",
            model_label="Seedance 2 (JM CLI)",
            output_url="https://example.com/output.mp4",
            last_frame_url=None,
        )

        with patch("uvpython_service.main.jimeng_job_store.get", return_value=job):
            with patch("uvpython_service.main._resolve_public_remote_ip", return_value="93.184.216.34") as resolve_host:
                with patch("uvpython_service.main._open_pinned_remote_asset", side_effect=HTTPException(status_code=403, detail="Jimeng remote output URL redirects are not allowed")) as open_pinned:
                    with patch("uvpython_service.main.urlopen") as open_url:
                        response = client.get("/api/jimeng/jobs/job-1/output")

        self.assertEqual(response.status_code, 403)
        resolve_host.assert_called_once_with("example.com")
        open_pinned.assert_called_once_with("https://example.com/output.mp4", "93.184.216.34")
        open_url.assert_not_called()

    def test_jimeng_remote_output_proxy_rejects_redirects(self) -> None:
        client = TestClient(app)
        job = build_job_state(
            model_id="jimeng-cli/seedance-2",
            model_label="Seedance 2 (JM CLI)",
            output_url="https://example.com/output.mp4",
            last_frame_url=None,
        )

        with patch("uvpython_service.main.jimeng_job_store.get", return_value=job):
            with patch("uvpython_service.main._resolve_public_remote_ip", return_value="93.184.216.34"):
                with patch("uvpython_service.main._open_pinned_remote_asset", side_effect=HTTPException(status_code=403, detail="Jimeng remote output URL redirects are not allowed")) as open_pinned:
                    response = client.get("/api/jimeng/jobs/job-1/output")

        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.json()["detail"], "Jimeng remote output URL redirects are not allowed")
        open_pinned.assert_called_once()

    def test_open_pinned_remote_asset_uses_explicit_url_port(self) -> None:
        FakePinnedConnection.instances = []

        with patch("uvpython_service.main._PinnedHTTPSConnection", FakePinnedConnection):
            _open_pinned_remote_asset("https://example.com:8443/output.mp4?download=1", "93.184.216.34")

        connection = FakePinnedConnection.instances[0]
        self.assertEqual(connection.host, "example.com")
        self.assertEqual(connection.pinned_ip, "93.184.216.34")
        self.assertEqual(connection.kwargs["port"], 8443)
        self.assertEqual(connection.requests[0][1], "/output.mp4?download=1")
        self.assertEqual(connection.requests[0][2]["Host"], "example.com:8443")

    def test_clear_jimeng_cache_rejects_cross_site_origin(self) -> None:
        client = TestClient(app, client=LOCAL_TEST_CLIENT)

        with patch("uvpython_service.main.clear_jimeng_cache") as clear_cache:
            response = client.delete(
                "/api/jimeng/cache",
                headers={
                    "Origin": "https://example.com",
                    "X-Canva-Banana-Local-Action": "jimeng-setup",
                },
            )

        self.assertEqual(response.status_code, 403)
        clear_cache.assert_not_called()

    def test_jimeng_setup_install_rejects_missing_local_action_header(self) -> None:
        client = TestClient(app, client=LOCAL_TEST_CLIENT)

        with patch("uvpython_service.main.install_or_update_jimeng_cli") as install_cli:
            response = client.post("/api/jimeng/setup/install", headers={"Origin": "http://localhost:5173"})

        self.assertEqual(response.status_code, 403)
        install_cli.assert_not_called()

    def test_jimeng_setup_install_rejects_cross_site_origin(self) -> None:
        client = TestClient(app, client=LOCAL_TEST_CLIENT)

        with patch("uvpython_service.main.install_or_update_jimeng_cli") as install_cli:
            response = client.post(
                "/api/jimeng/setup/install",
                headers={
                    "Origin": "https://example.com",
                    "X-Canva-Banana-Local-Action": "jimeng-setup",
                },
            )

        self.assertEqual(response.status_code, 403)
        install_cli.assert_not_called()

    def test_jimeng_setup_install_allows_trusted_local_frontend(self) -> None:
        client = TestClient(app, client=LOCAL_TEST_CLIENT)
        install_result = {"status": "ok", "message": "installed"}

        with patch("uvpython_service.main.install_or_update_jimeng_cli", return_value=install_result):
            response = client.post(
                "/api/jimeng/setup/install",
                headers={
                    "Origin": "http://localhost:5173",
                    "X-Canva-Banana-Local-Action": "jimeng-setup",
                },
            )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), install_result)

    def test_jimeng_setup_install_allows_packaged_desktop_file_origin_with_token(self) -> None:
        client = TestClient(app, client=LOCAL_TEST_CLIENT)
        install_result = {"status": "ok", "message": "installed"}

        with patch.dict("os.environ", {"CANVA_BANANA_DESKTOP_AUTH_TOKEN": DESKTOP_AUTH_TOKEN}):
            with patch("uvpython_service.main.install_or_update_jimeng_cli", return_value=install_result) as install_cli:
                response = client.post(
                    "/api/jimeng/setup/install",
                    headers={
                        "Origin": "file://",
                        "X-Canva-Banana-Local-Action": "jimeng-setup",
                        "X-Canva-Banana-Desktop-Token": DESKTOP_AUTH_TOKEN,
                    },
                )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), install_result)
        install_cli.assert_called_once()

    def test_jimeng_setup_install_rejects_remote_client_with_packaged_origin(self) -> None:
        client = TestClient(app, client=REMOTE_TEST_CLIENT)

        with patch("uvpython_service.main.install_or_update_jimeng_cli") as install_cli:
            response = client.post(
                "/api/jimeng/setup/install",
                headers={
                    "Origin": "null",
                    "X-Canva-Banana-Local-Action": "jimeng-setup",
                },
            )

        self.assertEqual(response.status_code, 403)
        install_cli.assert_not_called()

    def test_jimeng_setup_install_rejects_file_origin_with_host(self) -> None:
        client = TestClient(app, client=LOCAL_TEST_CLIENT)

        with patch("uvpython_service.main.install_or_update_jimeng_cli") as install_cli:
            response = client.post(
                "/api/jimeng/setup/install",
                headers={
                    "Origin": "file://example.com",
                    "X-Canva-Banana-Local-Action": "jimeng-setup",
                },
            )

        self.assertEqual(response.status_code, 403)
        install_cli.assert_not_called()

    def test_jimeng_setup_install_rejects_remote_client_without_origin(self) -> None:
        client = TestClient(app, client=REMOTE_TEST_CLIENT)

        with patch("uvpython_service.main.install_or_update_jimeng_cli") as install_cli:
            response = client.post(
                "/api/jimeng/setup/install",
                headers={"X-Canva-Banana-Local-Action": "jimeng-setup"},
            )

        self.assertEqual(response.status_code, 403)
        install_cli.assert_not_called()

    def test_jimeng_setup_install_rejects_remote_client_with_spoofed_origin(self) -> None:
        client = TestClient(app, client=REMOTE_TEST_CLIENT)

        with patch("uvpython_service.main.install_or_update_jimeng_cli") as install_cli:
            response = client.post(
                "/api/jimeng/setup/install",
                headers={
                    "Origin": "http://localhost:5173",
                    "X-Canva-Banana-Local-Action": "jimeng-setup",
                },
            )

        self.assertEqual(response.status_code, 403)
        install_cli.assert_not_called()

    def test_jimeng_setup_login_uses_same_local_request_guard(self) -> None:
        client = TestClient(app, client=LOCAL_TEST_CLIENT)

        with patch("uvpython_service.main.start_jimeng_login") as start_login:
            response = client.post(
                "/api/jimeng/setup/login?debug=true",
                headers={
                    "Origin": "https://example.com",
                    "X-Canva-Banana-Local-Action": "jimeng-setup",
                },
            )

        self.assertEqual(response.status_code, 403)
        start_login.assert_not_called()

    def test_jimeng_job_submission_rejects_missing_local_action_header(self) -> None:
        client = TestClient(app, client=LOCAL_TEST_CLIENT)

        with patch("uvpython_service.main.create_jimeng_job") as create_job:
            response = client.post(
                "/api/jimeng/jobs",
                data={"prompt": "make a video"},
                headers={"Origin": "http://localhost:5173"},
            )

        self.assertEqual(response.status_code, 403)
        create_job.assert_not_called()

    def test_jimeng_job_submission_rejects_cross_site_origin(self) -> None:
        client = TestClient(app, client=LOCAL_TEST_CLIENT)

        with patch("uvpython_service.main.create_jimeng_job") as create_job:
            response = client.post(
                "/api/jimeng/jobs",
                data={"prompt": "make a video"},
                headers={
                    "Origin": "https://example.com",
                    "X-Canva-Banana-Local-Action": "jimeng-setup",
                },
            )

        self.assertEqual(response.status_code, 403)
        create_job.assert_not_called()

    def test_jimeng_job_submission_allows_trusted_local_frontend(self) -> None:
        client = TestClient(app, client=LOCAL_TEST_CLIENT)
        job = build_job_state(
            model_id="jimeng-cli/seedance-2",
            model_label="Seedance 2 (JM CLI)",
            status="IN_QUEUE",
            output_url=None,
            last_frame_url=None,
        )

        with patch("uvpython_service.main.create_jimeng_job", return_value=job) as create_job:
            response = client.post(
                "/api/jimeng/jobs",
                data={
                    "prompt": "make a video",
                    "model_id": "jimeng-cli/seedance-2",
                    "variant": "smart",
                    "model_version": "seedance2.0fast",
                    "ratio": "16:9",
                    "duration": "5",
                    "resolution": "720p",
                    "generate_audio": "false",
                    "camera_fixed": "false",
                },
                headers={
                    "Origin": "http://localhost:5173",
                    "X-Canva-Banana-Local-Action": "jimeng-setup",
                },
            )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["provider"], "jimeng")
        create_job.assert_called_once()

    def test_jimeng_job_submission_rejects_unprobeable_reference_video(self) -> None:
        client = TestClient(app, client=LOCAL_TEST_CLIENT)

        with patch("uvpython_service.main.get_ffprobe_status", return_value=SimpleNamespace(available=True)):
            with patch("uvpython_service.main.probe_media_duration_seconds", return_value=None):
                with patch("uvpython_service.main.create_jimeng_job") as create_job:
                    response = client.post(
                        "/api/jimeng/jobs",
                        data={
                            "prompt": "make a video",
                            "model_id": "jimeng-cli/seedance-2",
                            "variant": "reference",
                            "model_version": "seedance2.0fast",
                            "ratio": "16:9",
                            "duration": "5",
                            "resolution": "720p",
                            "generate_audio": "false",
                            "camera_fixed": "false",
                        },
                        files={"reference_videos": ("ref.mp4", b"not-a-video", "video/mp4")},
                        headers={
                            "Origin": "http://localhost:5173",
                            "X-Canva-Banana-Local-Action": "jimeng-setup",
                        },
                    )

        self.assertEqual(response.status_code, 400)
        self.assertIn("Could not read reference video duration", response.json()["detail"])
        create_job.assert_not_called()

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
