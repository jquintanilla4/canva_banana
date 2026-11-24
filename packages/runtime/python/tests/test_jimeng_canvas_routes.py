import asyncio
import json
from uuid import uuid4

import httpx
from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect

from uvpython_service import main


HEADERS = {"Origin": "http://localhost:3000", "X-Canva-Banana-Local-Action": "jimeng-setup"}
JOBS = "/api/jimeng/canvas/jobs"


def test_canvas_rejects_untrusted_request_before_reading_upload():
    async def body():
        raise AssertionError("Canvas upload read before local authorization")
        yield b""

    async def send():
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=main.app), base_url="http://localhost") as client:
            return await client.post(JOBS, content=body(), headers={"Content-Type": "multipart/form-data; boundary=probe"})

    assert asyncio.run(send()).status_code == 403


def test_canvas_prepare_keeps_reference_order_and_cleans_temporary_inputs(monkeypatch):
    job_id = uuid4()
    paths = []

    def prepare(spec, files):
        assert spec.requestId == job_id
        assert [item.temp_path.read_bytes() for item in files] == [b"first", b"last"]
        paths.extend(item.temp_path for item in files)
        return {"id": str(job_id), "mediaType": "video", "phase": "awaiting_approval", "quote": {"credits": 8, "revision": "quote-1"}}

    monkeypatch.setattr(main, "prepare_canvas_job", prepare)
    client = TestClient(main.app, client=("127.0.0.1", 65432))
    response = client.post(JOBS, headers=HEADERS, data={"spec": json.dumps({
        "requestId": str(job_id), "mediaType": "video", "model": "seedance_2.5", "mode": "first_last_frame", "prompt": "Move",
    })}, files=[("files", ("first.png", b"first", "image/png")), ("files", ("last.png", b"last", "image/png"))])
    assert response.status_code == 200
    assert response.json()["quote"] == {"credits": 8, "revision": "quote-1"}
    assert all(not path.exists() for path in paths)


def test_canvas_resume_preparation_requires_a_trusted_local_request(monkeypatch):
    job_id = uuid4()
    calls = []

    def resume(received_id):
        calls.append(received_id)
        return {"id": str(received_id), "mediaType": "video", "phase": "preparing"}

    monkeypatch.setattr(main, "resume_canvas_preparation", resume)
    client = TestClient(main.app, client=("127.0.0.1", 65432))
    route = f"{JOBS}/{job_id}/resume-preparation"
    assert client.post(route).status_code == 403
    assert client.post(route, headers=HEADERS).json()["phase"] == "preparing"
    assert calls == [job_id]


def test_canvas_approval_passes_only_the_current_revision(monkeypatch):
    job_id = uuid4()
    calls = []

    def approve(received_id, revision):
        calls.append((received_id, revision))
        return {"id": str(received_id), "mediaType": "video", "phase": "running"}

    monkeypatch.setattr(main, "approve_canvas_job", approve)
    client = TestClient(main.app, client=("127.0.0.1", 65432))
    assert client.post(f"{JOBS}/{job_id}/approve", json={"revision": "quote-1"}).status_code == 403
    assert client.post(f"{JOBS}/{job_id}/approve", headers=HEADERS, json={"revision": "quote-1", "credits": 100}).status_code == 422
    response = client.post(f"{JOBS}/{job_id}/approve", headers=HEADERS, json={"revision": "quote-1"})
    assert response.status_code == 200
    assert calls == [(job_id, "quote-1")]


def test_retired_classic_endpoints_are_unavailable():
    client = TestClient(main.app, client=("127.0.0.1", 65432))
    requests = [
        ("GET", "/api/jimeng/health"),
        ("GET", "/api/jimeng/setup/status"),
        ("POST", "/api/jimeng/setup/install"),
        ("POST", "/api/jimeng/setup/login"),
        ("POST", "/api/jimeng/setup/login/check?login_session_id=old-session"),
        ("DELETE", "/api/jimeng/cache"),
        ("POST", "/api/jimeng/jobs"),
        ("GET", "/api/jimeng/jobs/old-job"),
        ("GET", "/api/jimeng/jobs/old-job/output"),
    ]
    for method, path in requests:
        assert client.request(method, path, headers=HEADERS).status_code == 404


def test_retired_classic_websocket_is_unavailable():
    client = TestClient(main.app, client=("127.0.0.1", 65432))
    try:
        with client.websocket_connect("/api/jimeng/jobs/old-job/ws"):
            raise AssertionError("Classic websocket unexpectedly accepted a connection")
    except WebSocketDisconnect as error:
        assert error.code == 1000
