from __future__ import annotations

import hashlib
import json
import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from uuid import UUID, uuid4

import pytest
from pydantic import ValidationError

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from uvpython_service import jimeng_canvas_jobs as jobs
from uvpython_service.jimeng_canvas_cli import CanvasCliError
from uvpython_service.models import MediaInput


class CanvasFixture:
    def __init__(self):
        self.calls = []
        self.nodes = {}
        self.credits = 8
        self.version = 1
        self.scope = "profile:account:personal"
        self.state = "running"
        self.run_error = None
        self.download_error = False
        self.confirm_error = None
        self.resource_id = str(uuid4())
        self.catalog = {kind: self.make_catalog(kind) for kind in ("image", "video")}

    def make_catalog(self, kind):
        flags = [{"flag": "--prompt", "required": True}, {"flag": "--ratio", "required": False, "values": ["16:9", "1:1"]}, {"flag": "--resolution", "required": True, "values": ["720p", "1080p"]}, {"flag": "--count", "required": False, "min": 1, "max": 4}]
        if kind == "video":
            flags.append({"flag": "--duration", "required": True, "min": 4, "max": 10, "step": 1})
        def mode(name, minimum, maximum, types):
            return {"name": name, "flags": flags, "references": {"min": minimum, "max": maximum, "types": types}}
        image = [{"mediaType": "image", "min": 1, "max": 2}]
        modes = [mode("t2v", 0, 0, []), mode("first_last_frame", 2, 2, image), mode("first_last_frame", 1, 1, image), mode("m2v", 1, 12, [{"mediaType": item, "min": 0, "max": 9} for item in ("image", "video", "audio")])] if kind == "video" else [mode("t2i", 0, 0, []), mode("i2i", 1, 2, image)]
        return {"items": [{"type": kind, "model": "seedance_2.5" if kind == "video" else "seedream_5.5", "modes": modes}]}

    def run(self, args, **kwargs):
        self.calls.append(args)
        command = tuple(args[:2])
        def flag(name):
            return args[args.index("--" + name) + 1]
        if command == ("canvas", "create"):
            return {"project": {"projectId": flag("project-id")}}
        if command == ("resource", "upload"):
            assert Path(flag("file")).is_file()
            return {"sourceProjectId": flag("project-id"), "resourceId": flag("resource-id"), "mediaType": flag("type")}
        if command == ("node", "create"):
            node = {"nodeId": flag("node-id"), "generation": {"model": flag("model"), "mode": flag("mode"), "prompt": flag("prompt"), "references": [{"kind": "res", "id": args[i + 1][4:]} for i, arg in enumerate(args) if arg == "--ref"]}}
            self.nodes[node["nodeId"]] = node
            return {"node": node, "mutation": {"savedDraftVersion": self.version}}
        if command == ("node", "show"):
            return {"nodes": [{"result": "found", "node": self.nodes[flag("node-id")]}], "draftVersion": self.version}
        if command == ("node", "quote"):
            return {"items": [{"nodeId": flag("node-id"), "maxCredits": self.credits}], "totalMaxCredits": self.credits, "draftVersion": self.version, "confirmable": True, "confirmationRequired": True, "consumptionSubject": {"kind": "personal", "userId": "account"}}
        if command == ("node", "confirm"):
            if self.confirm_error:
                raise self.confirm_error
            assert int(flag("credit-ceiling")) >= self.credits
            return {"creditConfirmationToken": "private-secret-token", "creditCeiling": int(flag("credit-ceiling")), "expiresAt": "2099-01-01", "consumptionSubject": {"kind": "personal", "userId": "account"}}
        if command == ("node", "run"):
            if self.run_error:
                raise self.run_error
            return {"items": [{"nodeId": flag("node-id"), "submitId": flag("submit-id"), "state": "accepted", "resources": []}]}
        if command == ("operation", "status"):
            return {"operationRef": args[2], "state": "succeeded" if self.state == "success" else self.state, "resources": [{"resourceId": self.resource_id, "sourceProjectId": flag("project-id"), "state": "succeeded"}] if self.state == "success" else []}
        if command == ("resource", "download"):
            if self.download_error:
                self.download_error = False
                raise CanvasCliError("private-token secret upstream error")
            payload = b"downloaded-media"
            target = Path(flag("output"))
            target.write_bytes(payload)
            return {"resourceId": args[2], "path": str(target), "contentType": "video/mp4", "size": len(payload), "sha256": hashlib.sha256(payload).hexdigest()}
        raise AssertionError(args)

    def count(self, first, second):
        return sum(call[:2] == [first, second] for call in self.calls)


@pytest.fixture
def canvas(monkeypatch, tmp_path):
    fixture = CanvasFixture()
    monkeypatch.setenv("JIMENG_CANVAS_WORK_DIR", str(tmp_path / "durable"))
    monkeypatch.setattr(jobs, "run_canvas", fixture.run)
    monkeypatch.setattr(jobs, "get_canvas_account_scope", lambda: fixture.scope)
    monkeypatch.setattr(jobs, "get_canvas_catalog", lambda kind: fixture.catalog[kind])
    return fixture


def request(**kwargs):
    values = {"requestId": uuid4(), "mediaType": "video", "mode": "t2v", "model": "seedance_2.5", "prompt": "A moving train", "resolution": "720p", "duration": 5}
    return jobs.CanvasJobRequest(**{**values, **kwargs})


def reference(tmp_path, kind="image", index=0):
    path = tmp_path / f"input-{index}"
    path.write_bytes(b"staged-input" + str(index).encode())
    return MediaInput(file_name="ignored-untrusted-name", content_type={"image": "image/png", "video": "video/mp4", "audio": "audio/mpeg"}[kind], temp_path=path, size_bytes=path.stat().st_size)


def prepare(spec):
    return jobs.prepare_canvas_job(spec, [])


def test_prepare_is_durable_and_deduplicates_without_submission(canvas):
    spec = request()
    first = prepare(spec)
    assert first["id"] == str(spec.requestId)
    assert first["phase"] == "awaiting_approval"
    assert first["quote"]["credits"] == 8
    assert first == prepare(spec)
    assert canvas.count("canvas", "create") == 1
    assert canvas.count("node", "create") == 1
    assert canvas.count("node", "run") == 0
    persisted = (jobs._job_dir(spec.requestId) / "job.json").read_text()
    assert "submit_id" in persisted
    assert "private-secret-token" not in persisted


def test_resume_preparation_uses_staged_references_and_preserves_approval(canvas, monkeypatch, tmp_path):
    spec = request(mode="first_last_frame")
    source = reference(tmp_path)

    def interrupt_upload(args, **kwargs):
        if args[:2] == ["resource", "upload"]:
            raise CanvasCliError("Interrupted upload")
        return canvas.run(args, **kwargs)

    monkeypatch.setattr(jobs, "run_canvas", interrupt_upload)
    interrupted = jobs.prepare_canvas_job(spec, [source])
    assert interrupted["phase"] == "preparing"
    source.temp_path.unlink()
    monkeypatch.setattr(jobs, "run_canvas", canvas.run)

    resumed = jobs.resume_canvas_preparation(spec.requestId)
    assert resumed["id"] == interrupted["id"]
    assert resumed["phase"] == "awaiting_approval"
    assert jobs.resume_canvas_preparation(spec.requestId) == resumed
    assert canvas.count("resource", "upload") == 1
    assert canvas.count("node", "create") == 1
    assert canvas.count("node", "run") == 0


def test_concurrent_approval_submits_once(canvas):
    spec = request()
    prepared = prepare(spec)
    with ThreadPoolExecutor(max_workers=4) as executor:
        results = list(executor.map(lambda _: jobs.approve_canvas_job(spec.requestId, prepared["quote"]["revision"]), range(4)))
    assert all(result["phase"] == "running" for result in results)
    assert canvas.count("node", "run") == 1
    assert canvas.count("node", "confirm") == 1
    run = next(call for call in canvas.calls if call[:2] == ["node", "run"])
    record = jobs._load(spec.requestId)
    assert run[run.index("--submit-id") + 1] == str(record.submit_id)
    assert "private-secret-token" not in (jobs._job_dir(spec.requestId) / "job.json").read_text()


def test_price_drift_requires_another_explicit_approval(canvas):
    spec = request()
    original = prepare(spec)
    canvas.credits = 9
    changed = jobs.approve_canvas_job(spec.requestId, original["quote"]["revision"])
    assert changed["phase"] == "awaiting_approval"
    assert changed["quote"]["credits"] == 9
    assert changed["quote"]["revision"] != original["quote"]["revision"]
    assert canvas.count("node", "run") == 0
    assert jobs.approve_canvas_job(spec.requestId, changed["quote"]["revision"])["phase"] == "running"
    assert canvas.count("node", "run") == 1


def test_node_change_cannot_be_approved_under_old_prompt(canvas):
    spec = request()
    original = prepare(spec)
    canvas.nodes[jobs._load(spec.requestId).node_id]["generation"]["prompt"] = "different prompt"
    assert jobs.approve_canvas_job(spec.requestId, original["quote"]["revision"])["phase"] == "failed"
    assert canvas.count("node", "run") == 0


@pytest.mark.parametrize("exit_code", [1, 10, 11, 20])
def test_uncertain_submission_is_only_observed_after_restart(canvas, exit_code):
    spec = request()
    original = prepare(spec)
    canvas.run_error = CanvasCliError("private-secret-token error", exit_code=exit_code)
    result = jobs.approve_canvas_job(spec.requestId, original["quote"]["revision"])
    assert result["phase"] == "recovering"
    assert "private-secret" not in json.dumps(result)
    assert jobs._load(spec.requestId).phase == "recovering"
    assert jobs.get_canvas_job(spec.requestId)["phase"] == "running"
    assert jobs.approve_canvas_job(spec.requestId, original["quote"]["revision"])["phase"] == "running"
    assert canvas.count("node", "run") == 1
    assert canvas.count("operation", "status") == 1


def test_recovery_cannot_turn_a_changed_node_into_a_price_only_approval(canvas, monkeypatch):
    spec = request()
    original = prepare(spec)
    canvas.run_error = CanvasCliError("Submission interrupted")
    assert jobs.approve_canvas_job(spec.requestId, original["quote"]["revision"])["phase"] == "recovering"
    record = jobs._load(spec.requestId)
    canvas.nodes[record.node_id]["generation"]["prompt"] = "A changed prompt"

    def run(args, **kwargs):
        if args[:2] == ["operation", "status"]:
            return {
                "operationRef": str(record.submit_id),
                "awaitingConfirmation": {"nodeId": record.node_id},
                "submission": {"resubmittable": True},
            }
        return canvas.run(args, **kwargs)

    monkeypatch.setattr(jobs, "run_canvas", run)
    assert jobs.get_canvas_job(spec.requestId)["phase"] == "failed"
    assert jobs._load(spec.requestId).quote == record.quote
    assert canvas.count("node", "run") == 1


def test_download_retries_preserve_placement_identity(canvas):
    spec = request()
    original = prepare(spec)
    jobs.approve_canvas_job(spec.requestId, original["quote"]["revision"])
    canvas.state = "success"
    canvas.download_error = True
    assert jobs.get_canvas_job(spec.requestId)["phase"] == "recovering"
    persisted_asset = jobs._load(spec.requestId).assets[0].id
    completed = jobs.get_canvas_job(spec.requestId)
    assert completed["phase"] == "completed"
    assert completed["assets"] == [{"id": str(persisted_asset), "contentType": "video/mp4"}]
    assert jobs.get_canvas_job(spec.requestId) == completed
    assert canvas.count("node", "run") == 1
    assert canvas.count("operation", "status") == 1
    assert canvas.count("resource", "download") == 2
    path, mime = jobs.get_canvas_asset(spec.requestId, persisted_asset)
    assert path.read_bytes() == b"downloaded-media" and mime == "video/mp4"
    with pytest.raises(jobs.CanvasJobError) as error:
        jobs.get_canvas_asset(spec.requestId, uuid4())
    assert error.value.status_code == 404


def test_cancel_never_submits_and_post_approval_cancel_is_rejected(canvas):
    spec = request()
    prepared = prepare(spec)
    assert jobs.cancel_canvas_job(spec.requestId)["phase"] == "cancelled"
    assert jobs.approve_canvas_job(spec.requestId, prepared["quote"]["revision"])["phase"] == "cancelled"
    assert canvas.count("node", "run") == 0
    second = request()
    quoted = prepare(second)
    jobs.approve_canvas_job(second.requestId, quoted["quote"]["revision"])
    with pytest.raises(jobs.CanvasJobError):
        jobs.cancel_canvas_job(second.requestId)


def test_current_account_scope_cannot_access_another_accounts_job(canvas):
    spec = request()
    prepared = prepare(spec)
    calls = len(canvas.calls)
    canvas.scope = "another-account"
    with pytest.raises(jobs.CanvasJobError):
        jobs.approve_canvas_job(spec.requestId, prepared["quote"]["revision"])
    with pytest.raises(jobs.CanvasJobError):
        jobs.get_canvas_job(spec.requestId)
    assert len(canvas.calls) == calls


@pytest.mark.parametrize("count", [1, 2])
def test_first_last_frame_catalog_duplicates_are_selected_by_reference_count(canvas, tmp_path, count):
    refs = [reference(tmp_path, index=index) for index in range(count)]
    spec = request(mode="first_last_frame")
    prepared = jobs.prepare_canvas_job(spec, refs)
    assert prepared["phase"] == "awaiting_approval"
    for media in refs:
        media.cleanup()
    record = jobs._load(spec.requestId)
    assert all((jobs._job_dir(spec.requestId) / ref.name).is_file() for ref in record.references)
    create = next(call for call in canvas.calls if call[:2] == ["node", "create"])
    assert [create[index + 1] for index, arg in enumerate(create) if arg == "--ref"] == [f"res:{ref.id}" for ref in record.references]


def test_multimodal_prompt_mentions_follow_typed_order(canvas, tmp_path):
    refs = [reference(tmp_path, "video", 0), reference(tmp_path, "image", 1), reference(tmp_path, "image", 2), reference(tmp_path, "audio", 3)]
    spec = request(mode="m2v", prompt="Use @Image2 and @video1 with @Audio1")
    assert jobs.prepare_canvas_job(spec, refs)["phase"] == "awaiting_approval"
    record = jobs._load(spec.requestId)
    create = next(call for call in canvas.calls if call[:2] == ["node", "create"])
    assert create[create.index("--prompt") + 1] == "Use {{res:" + record.references[2].id + "}} and {{res:" + record.references[0].id + "}} with {{res:" + record.references[3].id + "}}"


@pytest.mark.parametrize("changes", [{"model": "legacy-alias"}, {"duration": 4.5}, {"duration": 30}, {"resolution": "4k"}])
def test_invalid_catalog_settings_never_mutate_remote(canvas, changes):
    with pytest.raises(jobs.CanvasJobError):
        prepare(request(**changes))
    assert canvas.calls == []


def test_owned_backend_references_cannot_be_injected_in_prompt(canvas):
    with pytest.raises(ValidationError):
        request(prompt="use {{res:00000000-0000-0000-0000-000000000000}}")
    assert canvas.calls == []


def test_workspace_projects_reused_but_different_workspaces_are_isolated(canvas):
    prepare(request())
    prepare(request())
    prepare(request(workspaceKey="another-workspace"))
    assert canvas.count("canvas", "create") == 2


def test_request_id_reuse_with_new_payload_is_rejected(canvas):
    spec = request()
    prepare(spec)
    with pytest.raises(jobs.CanvasJobError):
        prepare(spec.model_copy(update={"prompt": "different"}))
    assert canvas.count("node", "create") == 1


def test_generated_node_ids_match_the_real_cli_grammar(canvas):
    import re
    for _ in range(20):
        assert re.fullmatch(r"node_[0-9abcdefghjkmnpqrstvwxyz]{10}", jobs._new_node_id())


def test_same_price_with_new_saved_draft_requires_approval(canvas):
    spec = request()
    initial = prepare(spec)
    canvas.version += 1
    updated = jobs.approve_canvas_job(spec.requestId, initial["quote"]["revision"])
    assert updated["phase"] == "awaiting_approval"
    assert updated["quote"]["credits"] == initial["quote"]["credits"]
    assert updated["quote"]["revision"] != initial["quote"]["revision"]
    assert canvas.count("node", "confirm") == 0


def test_quote_changes_during_confirmation_do_not_submit(canvas, monkeypatch):
    spec = request()
    initial = prepare(spec)
    original = canvas.run
    def run(args, **kwargs):
        result = original(args, **kwargs)
        if args[:2] == ["node", "confirm"]:
            canvas.credits += 1
        return result
    monkeypatch.setattr(jobs, "run_canvas", run)
    updated = jobs.approve_canvas_job(spec.requestId, initial["quote"]["revision"])
    assert updated["phase"] == "awaiting_approval"
    assert updated["quote"]["credits"] == 9
    assert canvas.count("node", "run") == 0
    monkeypatch.setattr(jobs, "run_canvas", original)
    assert jobs.approve_canvas_job(spec.requestId, updated["quote"]["revision"])["phase"] == "running"
    assert canvas.count("node", "run") == 1


@pytest.mark.parametrize("exit_code", [None, 10])
def test_node_change_during_confirmation_requires_new_preparation(canvas, monkeypatch, exit_code):
    spec = request()
    initial = prepare(spec)
    approved_fingerprint = jobs._load(spec.requestId).quote.node_fingerprint
    original = canvas.run

    def run(args, **kwargs):
        result = original(args, **kwargs)
        if args[:2] == ["node", "confirm"]:
            canvas.nodes[jobs._load(spec.requestId).node_id]["generation"]["prompt"] = "different prompt"
            if exit_code is not None:
                raise CanvasCliError("Confirmation expired", exit_code=exit_code)
        return result

    monkeypatch.setattr(jobs, "run_canvas", run)
    updated = jobs.approve_canvas_job(spec.requestId, initial["quote"]["revision"])
    assert updated["phase"] == "failed"
    assert "quote" not in updated
    assert jobs._load(spec.requestId).quote.node_fingerprint == approved_fingerprint
    assert jobs.approve_canvas_job(spec.requestId, initial["quote"]["revision"])["phase"] == "failed"
    assert canvas.count("node", "confirm") == 1
    assert canvas.count("node", "run") == 0


def test_expired_confirmation_demands_fresh_approval_without_submission(canvas):
    spec = request()
    initial = prepare(spec)
    canvas.confirm_error = CanvasCliError("private-secret-token expired", exit_code=10)
    updated = jobs.approve_canvas_job(spec.requestId, initial["quote"]["revision"])
    assert updated["phase"] == "awaiting_approval"
    assert updated["quote"]["revision"] != initial["quote"]["revision"]
    assert "private-secret" not in json.dumps(updated)
    assert canvas.count("node", "run") == 0
    canvas.confirm_error = None
    assert jobs.approve_canvas_job(spec.requestId, updated["quote"]["revision"])["phase"] == "running"
    assert canvas.count("node", "run") == 1


def test_required_reference_types_from_live_catalog_are_enforced(canvas, tmp_path):
    mode = canvas.catalog["video"]["items"][0]["modes"][-1]
    mode["references"]["requireAnyOfTypes"] = ["image", "video"]
    with pytest.raises(jobs.CanvasJobError):
        jobs.prepare_canvas_job(request(mode="m2v"), [reference(tmp_path, "audio")])
    assert canvas.calls == []


def test_empty_prompt_is_supported_when_catalog_allows_it(canvas, tmp_path):
    spec = request(mode="first_last_frame", prompt="")
    assert jobs.prepare_canvas_job(spec, [reference(tmp_path)])["phase"] == "awaiting_approval"


def test_out_of_range_prompt_mentions_fail_before_remote_mutation(canvas, tmp_path):
    with pytest.raises(jobs.CanvasJobError):
        jobs.prepare_canvas_job(request(mode="m2v", prompt="use @ Image 2"), [reference(tmp_path)])
    assert canvas.calls == []


def test_optional_content_type_is_detected_from_owned_media_header(canvas, tmp_path):
    path = tmp_path / "file"
    path.write_bytes(b"\x00\x00\x00\x20ftypisom" + b"\x00" * 20)
    assert jobs._output_content_type(path, None, "video") == "video/mp4"
    path.write_bytes(b"<html>not media</html>")
    with pytest.raises(ValueError):
        jobs._output_content_type(path, None, "video")


def test_output_from_another_project_is_never_downloaded(canvas, monkeypatch):
    spec = request()
    initial = prepare(spec)
    jobs.approve_canvas_job(spec.requestId, initial["quote"]["revision"])
    canvas.state = "success"
    original = canvas.run
    def run(args, **kwargs):
        result = original(args, **kwargs)
        if args[:2] == ["operation", "status"]:
            result["resources"][0]["sourceProjectId"] = str(uuid4())
        return result
    monkeypatch.setattr(jobs, "run_canvas", run)
    assert jobs.get_canvas_job(spec.requestId)["phase"] == "recovering"
    assert jobs._load(spec.requestId).assets == []
    assert canvas.count("resource", "download") == 0


def test_input_symlinks_fail_before_remote_mutation(canvas, tmp_path):
    media = reference(tmp_path)
    linked = tmp_path / "linked"
    linked.symlink_to(media.temp_path)
    media.temp_path = linked
    with pytest.raises(jobs.CanvasJobError):
        jobs.prepare_canvas_job(request(mode="first_last_frame"), [media])
    assert canvas.calls == []


def test_interrupted_preparation_reuses_all_persisted_mutation_ids(canvas, monkeypatch, tmp_path):
    media = reference(tmp_path)
    spec = request(mode="first_last_frame")
    original = canvas.run
    failures = [True]
    def run(args, **kwargs):
        result = original(args, **kwargs)
        if args[:2] == ["resource", "upload"] and failures and failures.pop():
            raise CanvasCliError("accept response was lost", exit_code=20)
        return result
    monkeypatch.setattr(jobs, "run_canvas", run)
    assert jobs.prepare_canvas_job(spec, [media])["phase"] == "preparing"
    first = jobs._load(spec.requestId)
    assert jobs.prepare_canvas_job(spec, [media])["phase"] == "awaiting_approval"
    second = jobs._load(spec.requestId)
    assert first.project_id == second.project_id
    assert first.node_id == second.node_id
    assert first.update_id == second.update_id
    assert first.submit_id == second.submit_id
    assert [ref.id for ref in first.references] == [ref.id for ref in second.references]
    assert canvas.count("resource", "upload") == 2
    assert canvas.count("node", "run") == 0


@pytest.mark.parametrize("mode", ["t2i", "i2i"])
def test_image_modes_use_the_authenticated_canonical_image_model(canvas, tmp_path, mode):
    spec = request(mediaType="image", model="seedream_5.5", mode=mode, duration=None)
    refs = [] if mode == "t2i" else [reference(tmp_path)]
    assert jobs.prepare_canvas_job(spec, refs)["phase"] == "awaiting_approval"
    create = next(call for call in canvas.calls if call[:2] == ["node", "create"])
    assert create[2] == "image"
    assert create[create.index("--model") + 1] == "seedream_5.5"


def test_literal_prompt_braces_and_email_handles_preserve_their_text(canvas, tmp_path):
    spec = request(mode="m2v", prompt="{{literal @Image99}} person@Image1 use @ image 1")
    assert jobs.prepare_canvas_job(spec, [reference(tmp_path)])["phase"] == "awaiting_approval"
    create = next(call for call in canvas.calls if call[:2] == ["node", "create"])
    assert create[create.index("--prompt") + 1].startswith("{{literal @Image99}} person@Image1 use {{res:")
