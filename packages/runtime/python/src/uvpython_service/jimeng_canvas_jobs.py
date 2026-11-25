from __future__ import annotations

import fcntl
import hashlib
import json
import math
import os
import re
import shutil
import stat
from contextlib import contextmanager
from functools import wraps
from pathlib import Path
from typing import Callable, Iterator, Literal, ParamSpec, TypeVar
from uuid import UUID, uuid4, uuid5

from pydantic import BaseModel, ConfigDict, Field, model_validator

from uvpython_service.config import get_settings
from uvpython_service.jimeng_canvas_cli import CanvasCliError, get_canvas_account_scope, get_canvas_catalog, run_canvas
from uvpython_service.models import MediaInput


class CanvasJobError(RuntimeError):
    def __init__(self, status_code: int, message: str) -> None:
        super().__init__(message)
        self.status_code = status_code


_P = ParamSpec("_P")
_T = TypeVar("_T")


def _public(function: Callable[_P, _T]) -> Callable[_P, _T]:
    @wraps(function)
    def guarded(*args: _P.args, **kwargs: _P.kwargs) -> _T:
        try:
            return function(*args, **kwargs)
        except CanvasJobError:
            raise
        except FileNotFoundError:
            raise CanvasJobError(404, "Canvas job or output was not found.") from None
        except ValueError as error:
            raise CanvasJobError(409, str(error)) from None
        except CanvasCliError as error:
            message = "Sign in to Canvas to continue." if error.exit_code == 11 else "Canvas is unavailable. Try again."
            raise CanvasJobError(409 if error.exit_code == 11 else 503, message) from None
        except OSError:
            raise CanvasJobError(503, "Canvas job storage is unavailable. Try again.") from None
    return guarded


class CanvasJobRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)
    requestId: UUID
    workspaceKey: str = Field(default="default", min_length=1, max_length=256)
    mediaType: Literal["video", "image"]
    mode: Literal["t2v", "first_last_frame", "m2v", "t2i", "i2i"]
    model: str = Field(min_length=1, max_length=256)
    prompt: str
    ratio: str | None = None
    resolution: str | None = None
    duration: float | None = Field(default=None, gt=0)
    count: int | None = Field(default=None, gt=0, strict=True)

    @model_validator(mode="after")
    def validate_media_mode(self) -> CanvasJobRequest:
        if (self.mediaType == "image") != (self.mode in {"t2i", "i2i"}):
            raise ValueError("The Canvas mode does not match the requested media type.")
        if self.mediaType == "image" and self.duration is not None:
            raise ValueError("Image generation does not accept a duration.")
        if re.search(r"\{\{\s*(?:res|node|uri|vid)\s*:", self.prompt, re.IGNORECASE):
            raise ValueError("Canvas resource placeholders are owned by the backend. Use typed media mentions.")
        return self


class StagedReference(BaseModel):
    id: str
    name: str
    media_type: Literal["image", "video", "audio"]
    digest: str
    uploaded: bool = False


class Quote(BaseModel):
    revision: str
    credits: int
    draft_version: int
    node_fingerprint: str
    consumption_subject: dict[str, object] | None = None


class Asset(BaseModel):
    id: UUID
    resource_id: str
    content_type: str | None = None
    downloaded: bool = False


class JobRecord(BaseModel):
    id: UUID
    spec: CanvasJobRequest
    account_scope: str
    project_id: UUID
    node_id: str
    update_id: UUID
    submit_id: UUID
    references: list[StagedReference] = Field(default_factory=list)
    phase: Literal["preparing", "awaiting_approval", "submitting", "running", "recovering", "completed", "failed", "cancelled"] = "preparing"
    saved: bool = False
    approval_round: int = 0
    quote: Quote | None = None
    assets: list[Asset] = Field(default_factory=list)
    message: str | None = None


_MENTIONS = re.compile(r"\{\{.*?\}\}|(?<![A-Za-z0-9_@])@\s*(Image|Video|Audio)\s*(\d+)(?![A-Za-z0-9_])", re.IGNORECASE | re.DOTALL)


_MEDIA_TYPES = {
    "image/jpeg": ("image", ".jpg"), "image/png": ("image", ".png"),
    "image/webp": ("image", ".webp"), "image/gif": ("image", ".gif"),
    "image/avif": ("image", ".avif"), "video/mp4": ("video", ".mp4"),
    "video/quicktime": ("video", ".mov"), "video/webm": ("video", ".webm"),
    "audio/mpeg": ("audio", ".mp3"), "audio/mp4": ("audio", ".m4a"),
    "audio/wav": ("audio", ".wav"), "audio/x-wav": ("audio", ".wav"),
    "audio/ogg": ("audio", ".ogg"), "audio/webm": ("audio", ".webm"),
    "audio/aac": ("audio", ".aac"), "audio/flac": ("audio", ".flac"),
}


def _root() -> Path:
    configured = os.environ.get("JIMENG_CANVAS_WORK_DIR", "").strip()
    path = Path(configured).expanduser() if configured else get_settings().jimeng_canvas_root_dir
    path.mkdir(parents=True, exist_ok=True, mode=0o700)
    return path.resolve()


@contextmanager
def _locked(path: Path) -> Iterator[None]:
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    with path.open("a+b") as handle:
        os.chmod(path, 0o600)
        fcntl.flock(handle, fcntl.LOCK_EX)
        try:
            yield
        finally:
            fcntl.flock(handle, fcntl.LOCK_UN)


def _atomic_json(path: Path, value: object) -> None:
    temporary = path.with_name(f".{path.name}.{uuid4()}.tmp")
    try:
        with temporary.open("x", encoding="utf-8") as handle:
            os.chmod(temporary, 0o600)
            json.dump(value, handle, ensure_ascii=False, allow_nan=False)
            handle.flush()
            os.fsync(handle.fileno())
        temporary.replace(path)
        directory = os.open(path.parent, os.O_RDONLY)
        try:
            os.fsync(directory)
        finally:
            os.close(directory)
    finally:
        temporary.unlink(missing_ok=True)


def _job_dir(job_id: UUID) -> Path:
    return _root() / "jobs" / str(UUID(str(job_id)))


def _save(job: JobRecord) -> None:
    _atomic_json(_job_dir(job.id) / "job.json", job.model_dump(mode="json"))


def _load(job_id: UUID) -> JobRecord:
    path = _job_dir(job_id) / "job.json"
    if not path.is_file():
        raise FileNotFoundError("Canvas job was not found.")
    job = JobRecord.model_validate_json(path.read_text(encoding="utf-8"))
    if job.id != job_id:
        raise ValueError("Canvas job identity is invalid.")
    return job


def _scope(job: JobRecord) -> None:
    if get_canvas_account_scope() != job.account_scope:
        raise ValueError("Sign in to the original Canvas account and space to access this job.")
    binding = _binding(job.account_scope, job.spec.workspaceKey)
    if binding != job.project_id:
        raise ValueError("The Canvas workspace binding has changed.")


def _binding(scope: str, workspace: str) -> UUID:
    key = hashlib.sha256(json.dumps([scope, workspace]).encode()).hexdigest()
    path = _root() / "workspaces" / f"{key}.json"
    with _locked(path.with_suffix(".lock")):
        if path.exists():
            data = json.loads(path.read_text(encoding="utf-8"))
            return UUID(data["projectId"])
        project = uuid4()
        _atomic_json(path, {"projectId": str(project), "created": False})
        return project


def _ensure_project(job: JobRecord) -> None:
    key = hashlib.sha256(json.dumps([job.account_scope, job.spec.workspaceKey]).encode()).hexdigest()
    path = _root() / "workspaces" / f"{key}.json"
    with _locked(path.with_suffix(".lock")):
        data = json.loads(path.read_text(encoding="utf-8"))
        if data.get("created"):
            return
        result = run_canvas(["canvas", "create", "Canva Banana workspace", "--project-id", str(job.project_id)])
        if result.get("project", {}).get("projectId") != str(job.project_id):
            raise ValueError("Canvas returned a different project identity.")
        data["created"] = True
        _atomic_json(path, data)


def _hash(value: object) -> str:
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode()).hexdigest()


def _digest_file(path: Path) -> str:
    with path.open("rb") as source:
        return hashlib.file_digest(source, "sha256").hexdigest()


def _media_info(media: MediaInput) -> tuple[str, str]:
    content_type = media.content_type.lower().split(";", 1)[0].strip()
    if content_type not in _MEDIA_TYPES:
        raise ValueError("This reference media type is not supported by Canvas.")
    info = media.temp_path.lstat()
    if not stat.S_ISREG(info.st_mode) or info.st_size == 0:
        raise ValueError("Canvas references must be nonempty staged media files.")
    return _MEDIA_TYPES[content_type]


def _validate(spec: CanvasJobRequest, files: list[MediaInput]) -> None:
    kinds = [_media_info(media)[0] for media in files]
    if spec.mode == "t2v" and files:
        raise ValueError("This text generation mode does not accept references.")
    if spec.mode == "first_last_frame" and (not 1 <= len(files) <= 2 or set(kinds) != {"image"}):
        raise ValueError("First and last frame generation requires one or two ordered images.")
    if spec.mode == "i2i" and (not files or set(kinds) != {"image"}):
        raise ValueError("Image editing requires image references.")
    if spec.mode == "m2v" and not files:
        raise ValueError("Multimodal generation requires references.")
    if spec.mode == "m2v":
        for match in _MENTIONS.finditer(spec.prompt):
            if match[1] is not None and not 1 <= int(match[2]) <= kinds.count(match[1].lower()):
                raise ValueError("A prompt media mention has no matching Canvas reference.")
    catalog = get_canvas_catalog(spec.mediaType)
    candidates = [item for item in catalog.get("items", []) if isinstance(item, dict) and item.get("model") == spec.model and item.get("type") == spec.mediaType]
    if len(candidates) != 1:
        raise ValueError("Select a canonical model from the current Canvas catalog.")
    modes = [mode for mode in candidates[0].get("modes", []) if mode.get("name") == spec.mode]
    if not modes:
        raise ValueError("The current Canvas model does not support this generation mode.")
    errors = []
    for mode in modes:
        try:
            _validate_mode(spec, kinds, mode)
            return
        except ValueError as error:
            errors.append(error)
    raise errors[-1]


def _validate_mode(spec: CanvasJobRequest, kinds: list[str], mode: dict[str, object]) -> None:
    values = {"prompt": spec.prompt, "ratio": spec.ratio, "resolution": spec.resolution, "duration": spec.duration, "count": spec.count}
    flags = {flag["flag"].removeprefix("--"): flag for flag in mode.get("flags", [])}
    for name, value in values.items():
        flag = flags.get(name)
        if value is None:
            if flag and flag.get("required"):
                raise ValueError(f"The selected Canvas model requires {name}.")
            continue
        if name != "prompt" and not flag:
            raise ValueError(f"The selected Canvas model does not support {name}.")
        if not flag:
            continue
        if "values" in flag and str(value) not in flag["values"] and not (isinstance(value, float) and value.is_integer() and str(int(value)) in flag["values"]):
            raise ValueError(f"The selected Canvas model does not support this {name}.")
        if isinstance(value, (int, float)):
            if "min" in flag and value < flag["min"] or "max" in flag and value > flag["max"]:
                raise ValueError(f"The Canvas {name} is outside the model limits.")
            if flag.get("step") and not math.isclose((value - flag.get("min", 0)) / flag["step"], round((value - flag.get("min", 0)) / flag["step"]), abs_tol=1e-7):
                raise ValueError(f"The Canvas {name} does not follow the model step.")
        if isinstance(value, str) and (len(value) < flag.get("minLength", 0) or len(value) > flag.get("maxLength", math.inf)):
            raise ValueError(f"The Canvas {name} is outside the model length limits.")
    for name, flag in flags.items():
        if flag.get("required") and name not in values and name not in {"model", "mode", "ref"}:
            raise ValueError(f"This Canvas model requires an unsupported control ({name}).")
    refs = mode.get("references")
    if kinds and not refs:
        raise ValueError("The Canvas catalog has not verified reference support for this mode.")
    if refs:
        if not refs.get("min", 0) <= len(kinds) <= refs.get("max", 0):
            raise ValueError("The reference count is outside the Canvas model limits.")
        allowed = {entry["mediaType"]: entry for entry in refs.get("types", [])}
        for kind in {"image", "video", "audio"}:
            count = kinds.count(kind)
            limits = allowed.get(kind, {"min": 0, "max": 0})
            if not limits.get("min", 0) <= count <= limits.get("max", 0):
                raise ValueError("The reference media counts are outside the Canvas model limits.")
        if refs.get("requireAnyOfTypes") and not set(kinds).intersection(refs["requireAnyOfTypes"]):
            raise ValueError("Add one of the Canvas model's required reference types.")
        if len(set(kinds).intersection(refs.get("mutuallyExclusiveTypes", []))) > 1:
            raise ValueError("The Canvas model does not allow these reference types together.")
    for combination in mode.get("forbiddenParamCombinations", []):
        blocked = {name: next((value for key, value in entry.items() if key.endswith("_value")), None) for name, entry in combination.items()}
        if blocked and all(values.get(name.removeprefix("--")) == value for name, value in blocked.items()):
            raise ValueError("The selected Canvas settings cannot be combined.")


def _dto(job: JobRecord) -> dict[str, object]:
    result: dict[str, object] = {"id": str(job.id), "mediaType": job.spec.mediaType, "phase": job.phase}
    if job.quote and job.phase == "awaiting_approval":
        result["quote"] = {"revision": job.quote.revision, "credits": job.quote.credits}
    if job.phase == "completed":
        result["assets"] = [{"id": str(asset.id), "contentType": asset.content_type} for asset in job.assets if asset.downloaded]
    if job.message:
        result["message"] = job.message
    return result


def _node_args(job: JobRecord) -> list[str]:
    return ["--project-id", str(job.project_id), "--node-id", job.node_id]


def _quote(job: JobRecord) -> Quote:
    shown = run_canvas(["node", "show", *_node_args(job)])
    nodes = shown.get("nodes", [])
    if not isinstance(nodes, list) or len(nodes) != 1 or not isinstance(nodes[0], dict):
        raise ValueError("The saved Canvas node could not be verified.")
    node = nodes[0].get("node", nodes[0])
    if not isinstance(node, dict) or node.get("nodeId") != job.node_id:
        raise ValueError("The saved Canvas node could not be verified.")
    generation = node.get("generation")
    if not isinstance(generation, dict):
        raise ValueError("The saved Canvas generation could not be verified.")
    result = run_canvas(["node", "quote", *_node_args(job)])
    items = result.get("items", [])
    credits = result.get("totalMaxCredits")
    version = result.get("draftVersion")
    if result.get("confirmable") is False or len(items) != 1 or items[0].get("nodeId") != job.node_id or items[0].get("error") or type(credits) is not int or credits < 0 or type(version) is not int:
        raise ValueError("Canvas did not return a confirmable quote for the saved node.")
    generation = dict(generation)
    references = generation.get("references") or []
    if not isinstance(references, list) or any(not isinstance(ref, dict) for ref in references):
        raise ValueError("The saved Canvas references could not be verified.")
    generation["references"] = [
        {"kind": ref.get("kind"), "id": ref.get("id"), "resourceId": resource.get("resourceId") if isinstance(resource, dict) else None}
        for ref in references for resource in [ref.get("resource")]
    ]
    fingerprint = _hash(generation)
    revision = _hash({"approvalRound": job.approval_round, "spec": job.spec.model_dump(mode="json"), "node": job.node_id, "generation": fingerprint, "draftVersion": version, "credits": credits, "subject": result.get("consumptionSubject"), "generationDiff": items[0].get("generationDiff")})
    return Quote(revision=revision, credits=credits, draft_version=version, node_fingerprint=fingerprint, consumption_subject=result.get("consumptionSubject"))



def _generation_prompt(job: JobRecord) -> str:
    if job.spec.mode != "m2v":
        return job.spec.prompt
    references = {kind: [ref for ref in job.references if ref.media_type == kind] for kind in ("image", "video", "audio")}
    def replace(match: re.Match[str]) -> str:
        if match[1] is None:
            return match[0]
        kind = match[1].lower()
        index = int(match[2]) - 1
        if not 0 <= index < len(references[kind]):
            raise ValueError("A prompt media mention has no matching Canvas reference.")
        return "{{res:" + references[kind][index].id + "}}"
    return _MENTIONS.sub(replace, job.spec.prompt)


def _new_node_id() -> str:
    value = uuid4().int
    alphabet = "0123456789abcdefghjkmnpqrstvwxyz"
    return "node_" + "".join(alphabet[(value >> shift) & 31] for shift in range(45, -1, -5))

def _prepare(job: JobRecord) -> None:
    _ensure_project(job)
    for reference in job.references:
        if not reference.uploaded:
            result = run_canvas(["resource", "upload", "--project-id", str(job.project_id), "--resource-id", reference.id, "--type", reference.media_type, "--file", str(_job_dir(job.id) / reference.name)])
            if result.get("resourceId") != reference.id or result.get("sourceProjectId", str(job.project_id)) != str(job.project_id):
                raise ValueError("Canvas returned an unexpected uploaded resource identity.")
            reference.uploaded = True
            _save(job)
    if not job.saved:
        args = ["node", "create", job.spec.mediaType, *_node_args(job), "--update-id", str(job.update_id), "--title", "Canva Banana generation", "--mode", job.spec.mode, "--model", job.spec.model, "--prompt", _generation_prompt(job)]
        for name in ("ratio", "resolution", "duration", "count"):
            value = getattr(job.spec, name)
            if value is not None:
                args.extend([f"--{name}", str(int(value)) if isinstance(value, float) and value.is_integer() else str(value)])
        for reference in job.references:
            args.extend(["--ref", f"res:{reference.id}"])
        result = run_canvas(args)
        if result.get("node", {}).get("nodeId") != job.node_id:
            raise ValueError("Canvas returned an unexpected saved node identity.")
        job.saved = True
        _save(job)
    job.quote = _quote(job)
    job.phase = "awaiting_approval"
    job.message = None
    _save(job)


@_public
def prepare_canvas_job(spec: CanvasJobRequest, files: list[MediaInput]) -> dict[str, object]:
    directory = _job_dir(spec.requestId)
    with _locked(directory / "job.lock"):
        scope = get_canvas_account_scope()
        if (directory / "job.json").exists():
            job = _load(spec.requestId)
            _scope(job)
            if job.spec != spec or len(files) != len(job.references) or any(_digest_file(media.temp_path) != ref.digest for media, ref in zip(files, job.references)):
                raise ValueError("This request ID already belongs to a different Canvas request.")
            if job.phase != "preparing":
                return _dto(job)
        else:
            _validate(spec, files)
            project = _binding(scope, spec.workspaceKey)
            job = JobRecord(id=spec.requestId, spec=spec, account_scope=scope, project_id=project, node_id=_new_node_id(), update_id=uuid4(), submit_id=uuid4())
            for index, media in enumerate(files):
                kind, suffix = _media_info(media)
                name = f"reference-{index}{suffix}"
                target = directory / name
                with media.temp_path.open("rb") as source, target.open("wb") as destination:
                    os.chmod(target, 0o600)
                    shutil.copyfileobj(source, destination, 1024 * 1024)
                    destination.flush()
                    os.fsync(destination.fileno())
                job.references.append(StagedReference(id=str(uuid4()), name=name, media_type=kind, digest=_digest_file(target)))
            _save(job)
        _prepare_record(job)
        return _dto(job)


def _prepare_record(job: JobRecord) -> None:
    try:
        _prepare(job)
    except CanvasCliError as exc:
        if exc.exit_code == 12:
            job.phase = "failed"
            job.message = str(exc)
        else:
            job.message = "Canvas preparation was interrupted. Retry this request to resume safely."
        _save(job)
    except (ValueError, OSError):
        job.message = "Canvas preparation was interrupted. Retry this request to resume safely."
        _save(job)


@_public
def resume_canvas_preparation(job_id: UUID) -> dict[str, object]:
    with _locked(_job_dir(job_id) / "job.lock"):
        job = _load(job_id)
        _scope(job)
        if job.phase == "preparing":
            _prepare_record(job)
        return _dto(job)


def _reject_changed_node(job: JobRecord, quote: Quote) -> bool:
    if job.quote and job.quote.node_fingerprint == quote.node_fingerprint:
        return False
    job.phase = "failed"
    job.message = "The Canvas node changed. Prepare a new generation to review its settings."
    _save(job)
    return True


@_public
def approve_canvas_job(job_id: UUID, revision: str) -> dict[str, object]:
    job_id = UUID(str(job_id))
    with _locked(_job_dir(job_id) / "job.lock"):
        job = _load(job_id)
        _scope(job)
        if job.phase != "awaiting_approval":
            return _dto(job)
        if not job.quote or revision != job.quote.revision:
            raise ValueError("This Canvas quote is no longer current. Review the latest quote.")
        try:
            latest = _quote(job)
            if _reject_changed_node(job, latest):
                return _dto(job)
            if latest.revision != revision:
                job.quote = latest
                job.message = "The Canvas quote changed. Review and approve the new quote."
                _save(job)
                return _dto(job)
            confirmation = run_canvas(["node", "confirm", *_node_args(job), "--credit-ceiling", str(job.quote.credits)])
            token = confirmation.get("creditConfirmationToken")
            ceiling = confirmation.get("creditCeiling")
            if not isinstance(token, str) or not token or type(ceiling) is not int or ceiling > job.quote.credits:
                raise ValueError("Canvas did not confirm the approved credit limit.")
            if job.quote.consumption_subject is not None and confirmation.get("consumptionSubject") != job.quote.consumption_subject:
                raise ValueError("Canvas confirmed a different credit account.")
            _scope(job)
            confirmed = _quote(job)
            if _reject_changed_node(job, confirmed):
                return _dto(job)
            if confirmed.revision != revision:
                job.quote = confirmed
                job.message = "The Canvas quote changed during confirmation. Review and approve it again."
                _save(job)
                return _dto(job)
            job.phase = "submitting"
            job.message = None
            _save(job)
            result = run_canvas(["node", "run", *_node_args(job), "--submit-id", str(job.submit_id), "--credit-token", token])
            items = result.get("items", [])
            if len(items) != 1 or items[0].get("submitId") != str(job.submit_id) or items[0].get("nodeId") != job.node_id:
                raise ValueError("Canvas did not confirm the recorded submission.")
            item = items[0]
            if item.get("state") in {"failed", "rejected", "canceled", "cancelled"} or item.get("error"):
                job.phase = "recovering"
                job.message = "The submission needs reconciliation. Check this job again."
            else:
                job.phase = "running"
            _save(job)
        except (CanvasCliError, ValueError, OSError) as error:
            if job.phase == "submitting":
                job.phase = "recovering"
                job.message = "Canvas submission is uncertain. Check this job to recover its recorded operation."
            elif isinstance(error, CanvasCliError) and error.exit_code == 10:
                job.approval_round += 1
                latest = _quote(job)
                if _reject_changed_node(job, latest):
                    return _dto(job)
                job.quote = latest
                job.message = "Canvas requires a fresh quote approval."
            else:
                job.message = "Canvas could not confirm this quote. Review it and try again."
            _save(job)
        return _dto(job)



def _output_content_type(target: Path, content_type: object, media_type: str) -> str:
    if content_type is None:
        with target.open("rb") as source:
            header = source.read(32)
        if header.startswith(b"\x89PNG\r\n\x1a\n"):
            content_type = "image/png"
        elif header.startswith(b"\xff\xd8\xff"):
            content_type = "image/jpeg"
        elif header.startswith((b"GIF87a", b"GIF89a")):
            content_type = "image/gif"
        elif header[:4] == b"RIFF" and header[8:12] == b"WEBP":
            content_type = "image/webp"
        elif header[4:8] == b"ftyp":
            content_type = "image/avif" if header[8:12] in {b"avif", b"avis"} else "video/mp4"
        elif header.startswith(b"\x1a\x45\xdf\xa3"):
            content_type = "video/webm"
    if not isinstance(content_type, str) or content_type not in _MEDIA_TYPES or _MEDIA_TYPES[content_type][0] != media_type:
        raise ValueError("Canvas returned an unsupported output media type.")
    return content_type

def _download_assets(job: JobRecord) -> None:
    for asset in job.assets:
        target = _job_dir(job.id) / f"asset-{asset.id}"
        if asset.downloaded and target.is_file() and not target.is_symlink():
            continue
        asset.downloaded = False
        result = run_canvas(["resource", "download", asset.resource_id, "--project-id", str(job.project_id), "--output", str(target)])
        content_type = result.get("contentType")
        if result.get("resourceId") != asset.resource_id or not isinstance(result.get("path"), str) or Path(result["path"]).resolve() != target or target.is_symlink() or not target.is_file() or target.stat().st_size == 0:
            raise ValueError("Canvas did not return the owned output file.")
        content_type = _output_content_type(target, content_type, job.spec.mediaType)
        if result.get("sha256") != _digest_file(target) or result.get("size") != target.stat().st_size:
            raise ValueError("Canvas output integrity verification failed.")
        os.chmod(target, 0o600)
        asset.content_type = content_type
        asset.downloaded = True
        _save(job)
    job.phase = "completed"
    job.message = None
    _save(job)


@_public
def get_canvas_job(job_id: UUID) -> dict[str, object]:
    job_id = UUID(str(job_id))
    with _locked(_job_dir(job_id) / "job.lock"):
        job = _load(job_id)
        _scope(job)
        if job.phase not in {"submitting", "running", "recovering"}:
            return _dto(job)
        try:
            if job.assets:
                _download_assets(job)
                return _dto(job)
            result = run_canvas(["operation", "status", str(job.submit_id), "--project-id", str(job.project_id)], timeout_seconds=30)
            if result.get("operationRef") != str(job.submit_id):
                raise ValueError("Canvas returned a different operation identity.")
            state = result.get("state")
            awaiting = result.get("awaitingConfirmation")
            submission = result.get("submission", {})
            if isinstance(awaiting, dict) and awaiting.get("nodeId") == job.node_id and submission.get("resubmittable") is True and not result.get("resources"):
                job.approval_round += 1
                renewed_quote = _quote(job)
                if _reject_changed_node(job, renewed_quote):
                    return _dto(job)
                job.quote = renewed_quote
                job.phase = "awaiting_approval"
                job.message = "Canvas requires a fresh approval before accepting this operation."
                _save(job)
                return _dto(job)
            if state in {"success", "succeeded", "completed", "partial_success"}:
                resources = result.get("resources", [])
                if not resources:
                    raise ValueError("Canvas has not returned generation outputs yet.")
                assets = []
                for resource in resources:
                    if resource.get("state") not in {"success", "succeeded", "completed"}:
                        if state == "partial_success":
                            continue
                        raise ValueError("Canvas output is not ready.")
                    resource_id = resource.get("resourceId")
                    valid_resource = isinstance(resource_id, str) and bool(re.fullmatch(r"(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|resource_[0-9]+(?:-[0-9]+)?)", resource_id))
                    if not valid_resource or resource.get("sourceProjectId", str(job.project_id)) != str(job.project_id):
                        raise ValueError("Canvas returned an output outside the job project.")
                    assets.append(Asset(id=uuid5(job.id, resource_id), resource_id=resource_id))
                if not assets:
                    raise ValueError("Canvas has not returned successful generation outputs.")
                job.assets = list({asset.id: asset for asset in assets}.values())
                _save(job)
                _download_assets(job)
            elif state in {"failed", "canceled", "cancelled"}:
                job.phase = "failed"
                job.message = "Canvas generation did not complete. Prepare a new request to generate again."
                _save(job)
            elif state in {"running", "pending", "queued", "accepted", "in_progress"}:
                job.phase = "running"
                job.message = None
                _save(job)
            else:
                job.phase = "recovering"
                job.message = "Canvas acceptance is still unknown. Check this recorded operation again."
                _save(job)
        except (CanvasCliError, ValueError, OSError):
            job.phase = "recovering"
            job.message = "Canvas is still recovering this operation or its output files. Check again to resume."
            _save(job)
        return _dto(job)


@_public
def cancel_canvas_job(job_id: UUID) -> dict[str, object]:
    job_id = UUID(str(job_id))
    with _locked(_job_dir(job_id) / "job.lock"):
        job = _load(job_id)
        _scope(job)
        if job.phase in {"preparing", "awaiting_approval"}:
            job.phase = "cancelled"
            job.quote = None
            job.message = None
            _save(job)
        elif job.phase != "cancelled":
            raise ValueError("A submitted Canvas generation cannot be cancelled here. Keep its job ID to recover it.")
        return _dto(job)


@_public
def get_canvas_asset(job_id: UUID, asset_id: UUID) -> tuple[Path, str]:
    job_id = UUID(str(job_id))
    asset_id = UUID(str(asset_id))
    with _locked(_job_dir(job_id) / "job.lock"):
        job = _load(job_id)
        _scope(job)
        for asset in job.assets:
            if asset.id == asset_id and asset.downloaded and asset.content_type and job.phase == "completed":
                path = _job_dir(job.id) / f"asset-{asset.id}"
                if path.is_file() and not path.is_symlink():
                    return path, asset.content_type
        raise FileNotFoundError("Canvas output was not found.")
