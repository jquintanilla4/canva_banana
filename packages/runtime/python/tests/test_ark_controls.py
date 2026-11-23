from __future__ import annotations

import json
import sys
import tempfile
import time
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

import httpx
import pytest
from fastapi.testclient import TestClient
from volcenginesdkarkruntime import Ark
from volcenginesdkarkruntime._exceptions import ArkAPIStatusError

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from uvpython_service.ark_references import resolve_reference_sources
from uvpython_service.main import app
from uvpython_service.models import AssetInput, DraftFinalizationPayload, JobState, MediaInput, SEEDANCE25_FLASH_MODEL_ID, SEEDANCE25_STANDARD_MODEL_ID, SeedanceJobPayload
from uvpython_service.store import JobStore
from uvpython_service.worker import _build_content, _create_draft_finalization_task, _create_remote_task, _draft_expires_at, _poll_remote_task, _validate_payload, resume_draft_finalization, serialize_job


HEADERS = {"X-Canva-Banana-Local-Action": "volcengine-submit", "Origin": "http://localhost:5173"}


def payload(**overrides: object) -> SeedanceJobPayload:
    kwargs = dict(prompt="a video", model_id=SEEDANCE25_STANDARD_MODEL_ID, variant="smart", ratio="16:9", duration=5)
    kwargs.update(overrides)
    return SeedanceJobPayload(**kwargs)


def job(**overrides: object) -> JobState:
    kwargs = dict(id="local-job", model_id=SEEDANCE25_STANDARD_MODEL_ID, model_label="Seedance 2.5", variant="smart", prompt="a video", status="IN_PROGRESS", created_at=1, updated_at=1)
    kwargs.update(overrides)
    return JobState(**kwargs)


def original(**overrides: object) -> dict[str, object]:
    task = dict(id="draft-1", model=SEEDANCE25_STANDARD_MODEL_ID, draft=True, status="succeeded", created_at=1793152800)
    task.update(overrides)
    return task


def ark_client(response_task: dict[str, object]) -> tuple[Ark, list[httpx.Request]]:
    requests: list[httpx.Request] = []

    def handle(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        return httpx.Response(200, json=response_task if request.method == "GET" else {"id": "task-final"})

    return Ark(api_key="test-only", http_client=httpx.Client(transport=httpx.MockTransport(handle))), requests


def test_controls_reach_real_sdk_request_bytes() -> None:
    client, requests = ark_client({})
    item = payload(resolution="480p", draft=True, web_search=True, return_last_frame=True, watermark=True, priority=0, output_format="mov")
    _validate_payload(item)
    _create_remote_task(client, item, [{"type": "text", "text": item.prompt}])
    body = json.loads(requests[0].content)
    assert body["tools"] == [{"type": "web_search"}]
    assert body["return_last_frame"] is True
    assert body["draft"] is True
    assert body["watermark"] is True
    assert "seed" not in body
    assert body["priority"] == 0
    assert body["output_format"] == "mov"
    assert "extra_body" not in body
    assert "camera_fixed" not in body
    assert requests[0].headers["authorization"] == "Bearer test-only"


@pytest.mark.parametrize("overrides", [dict(priority=-1), dict(priority=10), dict(priority=True), dict(draft=True), dict(draft=True, resolution="720p"), dict(draft=True, resolution="480p", model_id=SEEDANCE25_FLASH_MODEL_ID)])
def test_invalid_controls_rejected(overrides: dict[str, object]) -> None:
    with pytest.raises(ValueError):
        _validate_payload(payload(**overrides))


@pytest.mark.parametrize("resolution", ["480p", "720p"])
def test_flash_accepts_low_resolutions_and_seedance25_rules(resolution: str) -> None:
    _validate_payload(payload(model_id=SEEDANCE25_FLASH_MODEL_ID, duration=30, resolution=resolution))


@pytest.mark.parametrize("resolution", ["1080p", "4k"])
def test_flash_rejects_high_resolutions(resolution: str) -> None:
    with pytest.raises(ValueError):
        _validate_payload(payload(model_id=SEEDANCE25_FLASH_MODEL_ID, resolution=resolution))


@pytest.mark.parametrize(("field", "limit"), [("reference_images", 10), ("reference_videos", 5), ("reference_audios", 5)])
def test_flash_caps_count_asset_references(field: str, limit: int) -> None:
    media = [AssetInput(f"asset-{i}") for i in range(limit)]
    _validate_payload(payload(model_id=SEEDANCE25_FLASH_MODEL_ID, variant="reference", **{field: media}))
    with pytest.raises(ValueError):
        _validate_payload(payload(model_id=SEEDANCE25_FLASH_MODEL_ID, variant="reference", **{field: media + [AssetInput("extra")]}))


def test_manifest_orders_each_medium_and_assets_bypass_local_io() -> None:
    with tempfile.TemporaryDirectory() as directory:
        local = MediaInput("local.png", "image/png", Path(directory) / "local.png", 5)
        local.temp_path.write_bytes(b"local")
        sources = [dict(kind="asset", mediaType="image", assetId="image-asset"), dict(kind="upload", mediaType="image", index=0), dict(kind="asset", mediaType="video", assetId="video-asset"), dict(kind="asset", mediaType="audio", assetId="audio-asset")]
        resolved = resolve_reference_sources(json.dumps(sources), {"image": [local], "video": [], "audio": []})
        item = payload(variant="reference", reference_images=resolved["image"], reference_videos=resolved["video"], reference_audios=resolved["audio"])
        _validate_payload(item)
        with patch("uvpython_service.worker.media_to_data_url", return_value="data:local") as data_url, patch("uvpython_service.worker.upload_video_to_tos") as upload:
            content = _build_content("job", item, object())
        assert [entry.get("role") for entry in content[1:]] == ["reference_image", "reference_image", "reference_video", "reference_audio"]
        assert [next(value["url"] for key, value in entry.items() if key.endswith("_url")) for entry in content[1:]] == ["asset://image-asset", "data:local", "asset://video-asset", "asset://audio-asset"]
        data_url.assert_called_once_with(local)
        upload.assert_not_called()
        item.cleanup()
        assert not local.temp_path.exists()


@pytest.mark.parametrize("manifest", ["{}", "broken", "[]", '[{"kind":"upload","mediaType":"image","index":0},{"kind":"upload","mediaType":"image","index":0}]', '[{"kind":"upload","mediaType":"image","index":true}]', '[{"kind":"upload","mediaType":"image","index":1}]', '[{"kind":"asset","mediaType":"image","assetId":"https://example.com/image"}]', '[{"kind":"asset","mediaType":"image","assetId":"asset://id"}]'])
def test_manifest_rejects_missing_duplicate_indices_and_urls(manifest: str) -> None:
    media = MediaInput("x.png", "image/png", Path("unused"), 1)
    with pytest.raises(ValueError):
        resolve_reference_sources(manifest, {"image": [media], "video": [], "audio": []})


@pytest.mark.parametrize("variant,refs", [("smart", dict(reference_images=[AssetInput("asset-1")])), ("extend", dict(reference_videos=[AssetInput("asset-1")], reference_audios=[AssetInput("asset-2")])), ("edit", dict(reference_images=[AssetInput("asset-1")]))])
def test_assets_preserve_mode_roles(variant: str, refs: dict[str, object]) -> None:
    with pytest.raises(ValueError):
        _validate_payload(payload(variant=variant, ratio="adaptive", duration=-1, **refs))


def test_asset_video_does_not_suppress_invalid_local_duration() -> None:
    local = MediaInput("bad.mp4", "video/mp4", Path("unused"), 1, duration_seconds=40)
    with pytest.raises(ValueError):
        _validate_payload(payload(variant="reference", reference_videos=[AssetInput("asset-1"), local]))


def test_finalization_sends_only_approved_fields_in_actual_request_bytes() -> None:
    client, requests = ark_client(original())
    with patch("uvpython_service.worker._now_ms", return_value=1793152801000):
        _create_draft_finalization_task(client, DraftFinalizationPayload("draft-1", "4k", output_format="mov", return_last_frame=False, watermark=False, priority=9))
    assert [req.method for req in requests] == ["GET", "POST"]
    assert requests[0].url.path.endswith("/draft-1")
    assert json.loads(requests[1].content) == {
        "model": SEEDANCE25_STANDARD_MODEL_ID,
        "content": [{"type": "draft_task", "draft_task": {"id": "draft-1"}}],
        "resolution": "4k",
        "output_format": "mov",
        "return_last_frame": False,
        "watermark": False,
        "priority": 9,
    }


def test_finalization_omits_unset_overrides() -> None:
    client, requests = ark_client(original())
    with patch("uvpython_service.worker._now_ms", return_value=1793152801000):
        _create_draft_finalization_task(client, DraftFinalizationPayload("draft-1", "1080p"))
    assert set(json.loads(requests[1].content)) == {"model", "content", "resolution"}


@pytest.mark.parametrize("overrides", [dict(model=SEEDANCE25_FLASH_MODEL_ID), dict(draft=False), dict(status="running"), dict(status="expired"), dict(created_at=None), dict(created_at=1)])
def test_finalization_rechecks_provider_task_before_spending(overrides: dict[str, object]) -> None:
    client, requests = ark_client(original(**overrides))
    with patch("uvpython_service.worker._now_ms", return_value=1793152801000), pytest.raises(ValueError):
        _create_draft_finalization_task(client, DraftFinalizationPayload("draft-1", "4k"))
    assert [request.method for request in requests] == ["GET"]


def test_draft_ttl_uses_ark_created_at_cutoff() -> None:
    assert _draft_expires_at(SimpleNamespace(created_at=1793152800)) == (1793152800 + 14 * 86400) * 1000
    assert _draft_expires_at(SimpleNamespace(created_at=1793152799)) == (1793152799 + 7 * 86400) * 1000
    assert _draft_expires_at(SimpleNamespace(created_at=None)) is None


def test_expired_provider_state_is_terminal() -> None:
    store = JobStore()
    store.create(job())
    tasks = SimpleNamespace(get=lambda **_: SimpleNamespace(status="expired"))
    with patch("uvpython_service.worker.job_store", store):
        _poll_remote_task("local-job", SimpleNamespace(content_generation=SimpleNamespace(tasks=tasks)), "ark-task", SimpleNamespace(poll_interval_seconds=0))
    assert store.get("local-job").status == "FAILED"
    assert "expired" in store.get("local-job").error


def test_completed_draft_exposes_provider_expiry_and_request_id() -> None:
    store = JobStore()
    store.create(job(request_id="ark-task"))
    task = SimpleNamespace(status="succeeded", draft=True, created_at=1793152800, content=SimpleNamespace(video_url="https://example.com/video.mp4", last_frame_url=None))
    tasks = SimpleNamespace(get=lambda **_: task)
    with patch("uvpython_service.worker.job_store", store):
        _poll_remote_task("local-job", SimpleNamespace(content_generation=SimpleNamespace(tasks=tasks)), "ark-task", object())
    response = serialize_job(store.get("local-job"))
    assert response["requestId"] == "ark-task"
    assert response["draftExpiresAt"] == (1793152800 + 14 * 86400) * 1000


def test_resume_verifies_finalization_without_a_paid_create_call() -> None:
    client, requests = ark_client(original(id="final-1", draft=False, draft_task_id="draft-1", resolution="4k"))
    with patch("uvpython_service.worker.get_client", return_value=client), patch("uvpython_service.worker.Thread"):
        result = resume_draft_finalization("final-1", draft_task_id="draft-1", resolution="4k")
    assert result.request_id == "final-1"
    assert [req.method for req in requests] == ["GET"]


@pytest.mark.parametrize("draft_id,resolution", [("other-draft", "4k"), ("draft-1", "1080p")])
def test_resume_checks_that_recovered_task_matches_draft_and_resolution(draft_id: str, resolution) -> None:
    client, requests = ark_client(original(id="final-1", draft=False, draft_task_id="draft-1", resolution="4k"))
    with patch("uvpython_service.worker.get_client", return_value=client), pytest.raises(ValueError, match="does not match"):
        resume_draft_finalization("final-1", draft_task_id=draft_id, resolution=resolution)
    assert [req.method for req in requests] == ["GET"]


def test_resume_refreshes_cached_last_frame_url_without_creating_a_task() -> None:
    store = JobStore()
    store.create(job(
        status="COMPLETED", remote_task_id="final-1", request_id="final-1",
        output_url="https://example.com/old.mp4", last_frame_url="https://example.com/old.jpg",
        updated_at=time.time_ns() // 1_000_000,
    ))
    task = original(
        id="final-1", draft=False, draft_task_id="draft-1",
        content={"video_url": "https://example.com/new.mp4", "last_frame_url": "https://example.com/new.jpg"},
    )
    client, requests = ark_client(task)
    with patch("uvpython_service.worker.get_client", return_value=client), patch("uvpython_service.worker.job_store", store):
        result = resume_draft_finalization("final-1")
    assert result.id == "local-job"
    assert store.get("local-job").last_frame_url == "https://example.com/new.jpg"
    assert [req.method for req in requests] == ["GET"]


@pytest.mark.parametrize("overrides", [dict(draft=True), dict(draft_task_id=None), dict(model=SEEDANCE25_FLASH_MODEL_ID)])
def test_resume_rejects_unrelated_tasks(overrides: dict[str, object]) -> None:
    task = original(id="final-1", draft=False, draft_task_id="draft-1")
    task.update(overrides)
    client, requests = ark_client(task)
    with patch("uvpython_service.worker.get_client", return_value=client), pytest.raises(ValueError):
        resume_draft_finalization("final-1")
    assert [req.method for req in requests] == ["GET"]


@pytest.mark.parametrize("endpoint,body", [("draft-finalizations", {"draftTaskId": "draft-1", "resolution": "4k"}), ("resume", {"requestId": "final-1"})])
@pytest.mark.parametrize("peer,headers", [(("192.168.1.20", 1234), HEADERS), (("127.0.0.1", 1234), {}), (("127.0.0.1", 1234), dict(HEADERS, Origin="https://evil.example")), (("127.0.0.1", 1234), dict(HEADERS, Origin="null"))])
def test_new_routes_preserve_trusted_action_gate(endpoint: str, body: dict[str, object], peer: tuple[str, int], headers: dict[str, str]) -> None:
    with patch("uvpython_service.main.create_draft_finalization") as finalize, patch("uvpython_service.main.resume_draft_finalization") as resume:
        response = TestClient(app, client=peer).post(f"/api/volcengine/{endpoint}", json=body, headers=headers)
    assert response.status_code == 403
    finalize.assert_not_called()
    resume.assert_not_called()


def test_finalization_api_returns_recoverable_request_id_and_rejects_generation_controls() -> None:
    client = TestClient(app, client=("127.0.0.1", 1234))
    with patch("uvpython_service.main.create_draft_finalization", return_value=job(request_id="final-1")) as finalize:
        response = client.post("/api/volcengine/draft-finalizations", headers=HEADERS, json={"draftTaskId": "draft-1", "resolution": "4k", "priority": 0})
        assert response.status_code == 200
        assert response.json()["requestId"] == "final-1"
        assert finalize.call_args.args[0].priority == 0
        response = client.post("/api/volcengine/draft-finalizations", headers=HEADERS, json={"draftTaskId": "draft-1", "resolution": "4k", "prompt": "changed"})
        assert response.status_code == 422


def test_draft_validation_outage_reports_that_no_render_was_submitted() -> None:
    requests: list[str] = []

    def handle(request: httpx.Request) -> httpx.Response:
        requests.append(request.method)
        return httpx.Response(503, json={"error": {"message": "Temporarily unavailable"}})

    ark = Ark(api_key="test-only", max_retries=0, http_client=httpx.Client(transport=httpx.MockTransport(handle)))
    with patch("uvpython_service.worker.get_client", return_value=ark):
        response = TestClient(app, client=("127.0.0.1", 1234)).post(
            "/api/volcengine/draft-finalizations", headers=HEADERS, json={"draftTaskId": "draft-1", "resolution": "4k"},
        )
    assert requests == ["GET"]
    assert response.status_code == 503
    assert response.json()["detail"]["code"] == "draft-not-submitted"


@pytest.mark.parametrize("status", [404, 410, 200])
def test_resume_reports_confirmed_unavailability(status: int) -> None:
    task = original(id="final-1", draft=False, draft_task_id="draft-1", resolution="4k", status="expired")
    requests: list[str] = []

    def handle(request: httpx.Request) -> httpx.Response:
        requests.append(request.method)
        return httpx.Response(status, json=task if status == 200 else {"error": {"message": "Task expired"}})

    ark = Ark(api_key="test-only", max_retries=0, http_client=httpx.Client(transport=httpx.MockTransport(handle)))
    with patch("uvpython_service.worker.get_client", return_value=ark):
        response = TestClient(app, client=("127.0.0.1", 1234)).post(
            "/api/volcengine/resume", headers=HEADERS,
            json={"requestId": "final-1", "draftTaskId": "draft-1", "resolution": "4k"},
        )
    assert requests == ["GET"]
    assert response.status_code == 410
    assert response.json()["detail"]["code"] == "draft-task-unavailable"
    assert response.json()["detail"]["confirmedRequestId"] == ("final-1" if status == 200 else None)


@pytest.mark.parametrize("ark_status,expected", [(400, 400), (429, 429), (408, 500), (500, 500)])
def test_finalization_api_distinguishes_ark_rejections_from_ambiguous_failures(ark_status: int, expected: int) -> None:
    upstream = httpx.Response(ark_status, request=httpx.Request("POST", "https://ark.example"))
    error = ArkAPIStatusError("Ark request failed", response=upstream, body=None, request_id="test")
    with patch("uvpython_service.main.create_draft_finalization", side_effect=error):
        response = TestClient(app, client=("127.0.0.1", 1234)).post(
            "/api/volcengine/draft-finalizations", headers=HEADERS,
            json={"draftTaskId": "draft-1", "resolution": "4k"},
        )
    assert response.status_code == expected


def test_multipart_controls_and_asset_manifest_reach_payload() -> None:
    sources = [{"kind": "asset", "mediaType": "image", "assetId": "existing-1"}, {"kind": "upload", "mediaType": "image", "index": 0}]
    captured = []

    def create(item: SeedanceJobPayload) -> JobState:
        captured.append(item)
        _validate_payload(item)
        return job()

    with patch("uvpython_service.main.create_job", side_effect=create):
        response = TestClient(app, client=("127.0.0.1", 1234)).post("/api/volcengine/jobs", headers=HEADERS, data={"prompt": "a video", "model_id": SEEDANCE25_STANDARD_MODEL_ID, "variant": "reference", "duration": "5", "resolution": "480p", "web_search": "true", "return_last_frame": "true", "watermark": "true", "draft": "true", "seed": "-1", "priority": "0", "reference_sources": json.dumps(sources)}, files=[("reference_images", ("local.png", b"image", "image/png"))])
    assert response.status_code == 200
    item = captured[0]
    assert item.web_search and item.return_last_frame and item.watermark and item.draft
    assert item.priority == 0
    assert item.reference_images[0] == AssetInput("existing-1")
    assert item.reference_images[1].read_bytes() == b"image"
    item.cleanup()
