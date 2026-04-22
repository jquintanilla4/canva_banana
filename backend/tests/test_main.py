from __future__ import annotations

import sys
import unittest
from email.message import Message
from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect

PROJECT_ROOT = Path(__file__).resolve().parents[2]  # Reach the repo root from backend/tests.
sys.path.insert(0, str(PROJECT_ROOT / "backend" / "src"))  # Import the backend package without installing it.

from volcengine_service.main import app
from volcengine_service.models import JobState
from volcengine_service.store import JobStore


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


class MainApiTests(unittest.TestCase):
    def test_job_response_exposes_proxy_urls_and_provider_urls(self) -> None:
        client = TestClient(app)

        with patch("volcengine_service.main.job_store.get", return_value=build_job_state()):
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

        with patch("volcengine_service.main.job_store.get", return_value=build_job_state()):
            with patch("volcengine_service.main.urlopen", return_value=upstream_response):
                response = client.get("/api/volcengine/jobs/job-1/output")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.content, b"video-bytes")
        self.assertEqual(response.headers["content-type"], "video/mp4")
        self.assertEqual(response.headers["content-disposition"], 'attachment; filename="result.mp4"')
        self.assertTrue(upstream_response._closed)

    def test_job_websocket_streams_initial_snapshot_and_terminal_update_before_close(self) -> None:
        client = TestClient(app)
        fresh_store = JobStore()
        fresh_store.create(build_job_state(
            status="IN_PROGRESS",
            logs=["Preparing Volcengine request"],
            output_url=None,
            last_frame_url=None,
        ))

        with patch("volcengine_service.main.job_store", fresh_store):
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

        with patch("volcengine_service.main.job_store", fresh_store):
            with client.websocket_connect("/api/volcengine/jobs/missing-job/ws") as websocket:
                with self.assertRaises(WebSocketDisconnect) as close_error:
                    websocket.receive_json()

        self.assertEqual(close_error.exception.code, 1008)

if __name__ == "__main__":
    unittest.main()
