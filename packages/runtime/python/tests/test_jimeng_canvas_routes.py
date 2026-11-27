import asyncio
import json
import os
from uuid import uuid4

import httpx
import pytest
from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect

from uvpython_service import main


HEADERS = {"Origin": "http://localhost:3000", "X-Canva-Banana-Local-Action": "jimeng-setup"}
JOBS = "/api/jimeng/canvas/jobs"
SETUP = "/api/jimeng/canvas/setup"


@pytest.mark.skipif(os.name != "posix", reason="Local CLI removal requires POSIX directory descriptors")
def test_canvas_setup_removes_only_the_selected_legacy_executable(monkeypatch, tmp_path):
    home = tmp_path / "home"
    app_data = tmp_path / "app-data"
    monkeypatch.setenv("HOME", str(home))
    monkeypatch.setenv("JIMENG_WORK_DIR", str(app_data / "jimeng-work"))
    monkeypatch.setenv("JIMENG_CANVAS_ROOT_DIR", str(tmp_path / "separate-canvas-root"))
    monkeypatch.setenv("JIMENG_CANVAS_CLI_PATH", str(tmp_path / "not-installed"))
    monkeypatch.delenv(main.DESKTOP_AUTH_TOKEN_ENV_NAME, raising=False)
    home_cli = home / ".local/bin/dreamina"
    app_cli = app_data / ".tools/jimeng/bin/dreamina"
    other_cli = tmp_path / "other-bin/dreamina"
    canvas_cli = home_cli.with_name("dreamina-canvas")
    auth = home / ".dreamina_cli/version.json"
    for path in (home_cli, app_cli, other_cli, canvas_cli, auth):
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text("fixture")
        path.chmod(0o700)
    monkeypatch.setenv("JIMENG_CLI_PATH", str(other_cli))
    client = TestClient(main.app, client=("127.0.0.1", 65432))
    status = client.get(f"{SETUP}/status", headers=HEADERS).json()
    assert status["cliAvailable"] is False
    assert status["legacyCliInstallations"] == [
        {"location": "home", "path": str(home_cli.resolve())},
        {"location": "app", "path": str(app_cli.resolve())},
    ]
    remove_home = f"{SETUP}/legacy-cli/home/remove"
    assert client.get(remove_home, headers=HEADERS).status_code == 405
    assert client.post(remove_home).status_code == 403
    assert client.post(remove_home, headers={**HEADERS, "Origin": "https://example.com"}).status_code == 403
    assert client.post(f"{SETUP}/legacy-cli/other-bin/remove", headers=HEADERS).status_code == 422
    monkeypatch.setenv(main.DESKTOP_AUTH_TOKEN_ENV_NAME, "test-desktop-token")
    assert client.post(remove_home, headers=HEADERS).status_code == 403
    assert client.post(remove_home, headers={"X-Canva-Banana-Local-Action": "jimeng-setup"}).status_code == 403
    assert home_cli.is_file()
    desktop_headers = {**HEADERS, "Origin": "null", main.DESKTOP_AUTH_TOKEN_HEADER_NAME: "test-desktop-token"}
    assert client.post(remove_home, headers=desktop_headers).json()["message"] == "Legacy Dreamina CLI removed. Login data was kept."
    assert not home_cli.exists()
    monkeypatch.delenv(main.DESKTOP_AUTH_TOKEN_ENV_NAME)
    assert client.post(remove_home, headers=HEADERS).status_code == 200
    assert client.get(f"{SETUP}/status", headers=HEADERS).json()["legacyCliInstallations"] == [
        {"location": "app", "path": str(app_cli.resolve())},
    ]
    assert client.post(f"{SETUP}/legacy-cli/app/remove", headers=HEADERS).status_code == 200
    assert not app_cli.exists()
    assert client.get(f"{SETUP}/status", headers=HEADERS).json()["legacyCliInstallations"] == []
    assert all(path.read_text() == "fixture" for path in (auth, canvas_cli, other_cli))


@pytest.mark.skipif(os.name != "posix", reason="Local CLI removal requires POSIX directory descriptors")
def test_canvas_setup_survives_an_invalid_legacy_work_dir(monkeypatch, tmp_path):
    monkeypatch.setenv("HOME", str(tmp_path))
    monkeypatch.setenv("JIMENG_WORK_DIR", "~canva-banana-nonexistent-test-user/work")
    monkeypatch.delenv(main.DESKTOP_AUTH_TOKEN_ENV_NAME, raising=False)
    canvas_status = {"cliAvailable": True, "authenticated": True}
    monkeypatch.setattr(main, "get_canvas_setup_status", lambda: canvas_status)
    client = TestClient(main.app, client=("127.0.0.1", 65432), raise_server_exceptions=False)
    response = client.get(f"{SETUP}/status", headers=HEADERS)
    assert response.status_code == 200
    assert response.json() == {**canvas_status, "legacyCliInstallations": []}
    response = client.post(f"{SETUP}/legacy-cli/app/remove", headers=HEADERS)
    assert response.status_code == 502
    assert response.json()["detail"] == "Could not resolve the legacy Dreamina CLI location."


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
