from __future__ import annotations

import json
import os
import re
import shutil
import subprocess
import time
from dataclasses import dataclass
from pathlib import Path
from threading import Lock, Thread
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen
from uuid import uuid4

from uvpython_service.config import Settings, get_settings
from uvpython_service.models import JobState, SeedanceJobPayload
from uvpython_service.store import JobStore

JIMENG_MODEL_ID = "jimeng-cli/seedance-2"  # Frontend selector id for the local Dreamina CLI.
JIMENG_MODEL_LABEL = "Seedance 2 (JM CLI)"  # Queue and metadata label.
JIMENG_INSTALL_COMMAND = "curl -fsSL https://jimeng.jianying.com/cli | bash"  # Official install/update command.
JIMENG_INSTALL_URL = "https://jimeng.jianying.com/cli"  # Official installer script URL.
JIMENG_LOGIN_COMMAND = "dreamina login"  # Official browser login command.
JIMENG_DEBUG_LOGIN_COMMAND = "dreamina login --debug"  # Official login troubleshooting command.
JIMENG_EXECUTABLE_NAMES = ("dreamina", "jm")  # CLI names shipped by Jimeng over time.
VIDEO_EXTENSIONS = {".mp4", ".mov", ".m4v", ".webm"}  # Video formats the canvas loader can handle.
REMOTE_URL_RE = re.compile(r"https?://[^\s\"'<>]+")  # Pull URLs out of mixed CLI logs.
SUBMIT_ID_RE = re.compile(r"(?:submit_id|submitId)\s*[=:]\s*\"?([A-Za-z0-9._:-]+)\"?", re.IGNORECASE)  # Fallback for text logs.
VIDEO_URL_KEYS = {"video_url", "videourl", "output_url", "outputurl", "download_url", "downloadurl", "result_url", "resulturl", "url"}  # Only result-like URL fields can complete a job.
LOGIN_STARTUP_CAPTURE_SECONDS = 4.0  # Give login enough time to print manual browser URLs.
JIMENG_SEEDANCE_MODEL_VERSIONS = {"seedance2.0fast", "seedance2.0", "seedance2.0_vip", "seedance2.0fast_vip"}  # CLI --model_version values.
JIMENG_DEFAULT_MODEL_VERSION = "seedance2.0fast"  # Matches dreamina text2video help default.
JIMENG_WORK_DIR_SENTINEL = ".canva-banana-jimeng-work-dir"  # Refuse cache deletes from broad user-selected folders.

jimeng_job_store = JobStore()  # Jimeng jobs stay separate from Volcengine jobs.
_login_process_lock = Lock()  # Serialize login launch checks across concurrent setup clicks.
_active_login_process: subprocess.Popen[bytes] | None = None  # Track the detached login flow while it is still running.


@dataclass(frozen=True)
class JimengCommandResult:
    returncode: int
    stdout: str
    stderr: str

    @property
    def combined_output(self) -> str:
        return "\n".join(part for part in (self.stdout, self.stderr) if part).strip()  # Preserve both streams for parsing.


@dataclass(frozen=True)
class JimengParsedOutput:
    status: str | None
    submit_id: str | None
    output_url: str | None
    output_path: Path | None
    error_message: str | None


def _now_ms() -> int:
    return int(time.time() * 1000)  # UI timestamps are milliseconds.


def _log(job_id: str, message: str) -> None:
    jimeng_job_store.append_log(job_id, message, _now_ms())  # Keep logs visible in the shared queue panel.


def _is_remote_url(value: str | None) -> bool:
    return bool(value and re.match(r"^https?://", value, flags=re.IGNORECASE))  # Distinguish provider URLs from local downloads.


def _is_remote_video_url(value: str | None) -> bool:
    if not _is_remote_url(value):
        return False
    return Path(value.split("?", 1)[0]).suffix.lower() in VIDEO_EXTENSIONS  # Ignore help/login URLs that cannot be served as video.


def _get_local_jimeng_bin_dir(settings: Settings) -> Path:
    return settings.jimeng_work_dir.parent / ".tools" / "jimeng" / "bin"  # App installs stay outside the generated-video cache.


def _iter_jimeng_search_dirs(settings: Settings) -> list[Path]:
    home_dir = Path.home()
    return [
        _get_local_jimeng_bin_dir(settings),
        home_dir / ".local" / "bin",
        home_dir / "bin",
        Path("/opt/homebrew/bin"),
        Path("/usr/local/bin"),
        Path("/usr/bin"),
        Path("/bin"),
        Path("/usr/sbin"),
        Path("/sbin"),
    ]  # Finder-launched Electron apps do not inherit the user's interactive shell PATH.


def _join_unique_path_segments(segments: list[str]) -> str:
    unique_segments: list[str] = []
    seen_segments: set[str] = set()
    for segment in segments:
        normalized_segment = segment.strip()
        if not normalized_segment or normalized_segment in seen_segments:
            continue
        seen_segments.add(normalized_segment)
        unique_segments.append(normalized_segment)
    return os.pathsep.join(unique_segments)  # Preserve order while avoiding duplicate PATH entries.


def _build_jimeng_search_path(settings: Settings, *, extra_dirs: list[Path] | None = None) -> str:
    configured_segments = os.environ.get("PATH", "").split(os.pathsep)
    fallback_segments = [str(path.expanduser()) for path in [*(extra_dirs or []), *_iter_jimeng_search_dirs(settings)]]
    return _join_unique_path_segments([*fallback_segments, *configured_segments])  # Search app and common shell install dirs first.


def _build_jimeng_subprocess_env(settings: Settings, *, install_dir: Path | None = None) -> dict[str, str]:
    env = os.environ.copy()
    extra_dirs = [install_dir] if install_dir else []
    env["PATH"] = _build_jimeng_search_path(settings, extra_dirs=extra_dirs)
    if install_dir:
        env.pop("DREAMINA_INSTALL_DIR", None)  # Let the app-managed install dir win over old shell state.
        env["DREAMINA_CLI_INSTALL_DIR"] = str(install_dir)  # Official installer honors this destination.
    return env  # Child processes need a shell-like PATH even when Electron was opened from Finder.


def _resolve_jimeng_executable(settings: Settings) -> str:
    search_path = _build_jimeng_search_path(settings)
    explicit_path = settings.jimeng_cli_path
    if explicit_path:
        explicit_candidate = Path(explicit_path).expanduser()
        if explicit_candidate.exists():
            return str(explicit_candidate)  # Allow repo-local or custom installs.
        resolved_explicit = shutil.which(explicit_path, path=search_path)
        if resolved_explicit:
            return resolved_explicit  # Allow env overrides like JIMENG_CLI_PATH=dreamina.
        raise RuntimeError(f"Jimeng CLI not found at JIMENG_CLI_PATH={explicit_path}.")

    for executable_name in JIMENG_EXECUTABLE_NAMES:
        resolved = shutil.which(executable_name, path=search_path)
        if resolved:
            return resolved  # Fall back to app-local and common global installs from the official script.

    raise RuntimeError(
        f"Jimeng CLI not found. Install or update with `{JIMENG_INSTALL_COMMAND}`, "
        "or set JIMENG_CLI_PATH to the dreamina executable. Checked the app tools folder, ~/.local/bin, ~/bin, "
        "/opt/homebrew/bin, and /usr/local/bin."
    )


def _ensure_jimeng_work_dir(settings: Settings) -> Path:
    settings.jimeng_work_dir.mkdir(parents=True, exist_ok=True)  # Create the dedicated backend-owned work directory.
    sentinel_path = settings.jimeng_work_dir / JIMENG_WORK_DIR_SENTINEL
    sentinel_path.touch(exist_ok=True)  # Mark the folder as safe for later cache cleanup.
    return sentinel_path


def _require_jimeng_cache_work_dir(settings: Settings) -> None:
    sentinel_path = settings.jimeng_work_dir / JIMENG_WORK_DIR_SENTINEL
    if not sentinel_path.exists():
        raise RuntimeError(
            f"Refusing to clear Jimeng cache because {settings.jimeng_work_dir} is not marked as a Canva Banana Jimeng work directory."
        )  # Prevent accidental recursive video deletion in broad folders.


def _run_jimeng_command(
    args: list[str],
    *,
    settings: Settings,
    timeout_seconds: int,
    cwd: Path | None = None,
) -> JimengCommandResult:
    executable = _resolve_jimeng_executable(settings)
    working_dir = cwd or settings.jimeng_work_dir
    _ensure_jimeng_work_dir(settings)
    working_dir.mkdir(parents=True, exist_ok=True)  # The CLI needs a place for downloads and temp files.
    try:
        completed = subprocess.run(
            [executable, *args],
            cwd=working_dir,
            env=_build_jimeng_subprocess_env(settings),
            capture_output=True,
            text=True,
            timeout=timeout_seconds,
            check=False,
        )  # Run without a shell so prompts and file paths cannot become shell code.
    except subprocess.TimeoutExpired as exc:
        stdout = exc.stdout if isinstance(exc.stdout, str) else ""
        stderr = exc.stderr if isinstance(exc.stderr, str) else ""
        raise TimeoutError(f"Jimeng CLI command timed out after {timeout_seconds} seconds.\n{stdout}\n{stderr}".strip()) from exc
    return JimengCommandResult(
        returncode=completed.returncode,
        stdout=completed.stdout or "",
        stderr=completed.stderr or "",
    )


def _iter_json_values(text: str) -> list[object]:
    decoder = json.JSONDecoder()
    values: list[object] = []
    for index, char in enumerate(text):
        if char not in "{[":
            continue
        try:
            value, _ = decoder.raw_decode(text[index:])
        except json.JSONDecodeError:
            continue
        values.append(value)
    return values  # CLI logs may wrap one or more JSON payloads in human text.


def _iter_json_strings(value: object, key: str = "") -> list[tuple[str, str]]:
    if isinstance(value, dict):
        pairs: list[tuple[str, str]] = []
        for child_key, child_value in value.items():
            pairs.extend(_iter_json_strings(child_value, str(child_key)))
        return pairs
    if isinstance(value, list):
        pairs: list[tuple[str, str]] = []
        for child_value in value:
            pairs.extend(_iter_json_strings(child_value, key))
        return pairs
    if isinstance(value, str):
        return [(key, value)]
    return []  # Non-string leaves cannot contain ids or asset URLs.


def _find_downloaded_video(download_dir: Path) -> Path | None:
    if not download_dir.exists():
        return None
    candidates = [
        path
        for path in download_dir.rglob("*")
        if path.is_file() and path.suffix.lower() in VIDEO_EXTENSIONS
    ]
    if not candidates:
        return None
    return max(candidates, key=lambda path: path.stat().st_mtime)  # Use the newest downloaded result.


def _parse_status_from_text(text: str) -> str | None:
    normalized_text = text.lower()
    for token in ("failed", "failure", "fail"):
        if token in normalized_text:
            return "failed"
    if re.search(r"(?<![A-Za-z0-9_])error(?![A-Za-z0-9_])", normalized_text):
        return "failed"  # Match freeform errors without tripping on JSON keys like error_msg.
    for token in ("success", "succeeded", "completed", "done"):
        if token in normalized_text:
            return "success"
    for token in ("querying", "running", "processing", "pending", "queue"):
        if token in normalized_text:
            return "querying"
    return None  # Unknown status can still be parsed by submit_id or output.


def _parse_jimeng_output(text: str, *, download_dir: Path | None = None, output_root_dir: Path | None = None) -> JimengParsedOutput:
    submit_id: str | None = None
    status: str | None = None
    output_url: str | None = None
    output_path: Path | None = None
    error_message: str | None = None
    resolved_output_root_dir = (output_root_dir or download_dir).resolve() if output_root_dir or download_dir else None

    for json_value in _iter_json_values(text):
        for key, value in _iter_json_strings(json_value):
            normalized_key = key.lower()
            if normalized_key in {"submit_id", "submitid", "task_id", "taskid"} and not submit_id:
                submit_id = value  # Retain the provider id for later query_result calls.
            if normalized_key in {"status", "gen_status", "genstatus", "state"} and not status:
                status = _parse_status_from_text(value) or value.lower()  # Normalize common CLI states.
            if normalized_key in {"fail_reason", "failreason", "error", "error_message", "error_msg", "err_msg"} and value.strip() and not error_message:
                error_message = value  # CLI can return task failures as JSON while still exiting 0.
            if normalized_key in VIDEO_URL_KEYS and _is_remote_video_url(value) and not output_url:
                output_url = value  # Prefer explicit URL fields over regex guesses.
            if any(token in normalized_key for token in ("path", "file", "download")) and not output_path:
                candidate = Path(value).expanduser()
                if not candidate.is_absolute() and resolved_output_root_dir:
                    candidate = resolved_output_root_dir / candidate  # Resolve CLI-relative paths from the command work dir.
                if candidate.exists() and candidate.suffix.lower() in VIDEO_EXTENSIONS:
                    resolved_candidate = candidate.resolve()
                    if not resolved_output_root_dir:
                        output_path = candidate  # Parser-only callers can still inspect local CLI paths.
                    else:
                        try:
                            resolved_candidate.relative_to(resolved_output_root_dir)
                        except ValueError:
                            continue  # Ignore paths the output endpoint will refuse to serve.
                        output_path = resolved_candidate  # Local downloads must stay inside the backend work dir.

    if not submit_id:
        match = SUBMIT_ID_RE.search(text)
        submit_id = match.group(1) if match else None  # Fallback for non-JSON submit_id logs.
    if not output_path and download_dir:
        output_path = _find_downloaded_video(download_dir)
    if not status:
        status = _parse_status_from_text(text)
    if output_url or output_path:
        status = "success"  # A concrete video asset is terminal success.

    return JimengParsedOutput(
        status=status,
        submit_id=submit_id,
        output_url=output_url,
        output_path=output_path,
        error_message=error_message,
    )


def _format_command_failure(result: JimengCommandResult) -> str:
    detail = result.combined_output or "No CLI output."
    return f"Jimeng CLI failed with exit code {result.returncode}: {detail}"  # Include enough output for user-side troubleshooting.


def _is_failed_status(status: str | None) -> bool:
    return status == "failed"  # Normalize CLI fail/failed variants in one place.


def _log_cli_output(job_id: str, label: str, output: str) -> None:
    if not output.strip():
        return
    output_tail = output.strip()[-2000:]
    _log(job_id, f"{label}: {output_tail}")  # Keep enough raw CLI output to debug provider-side failures.


def _extract_first_url(text: str) -> str | None:
    for raw_url in REMOTE_URL_RE.findall(text):
        return raw_url.rstrip(".,);]")
    return None  # Login output may contain a manual browser URL.


def _build_login_required_message(result: JimengCommandResult) -> str:
    detail = _format_command_failure(result)
    return (
        "Jimeng CLI is installed, but no valid login is available. "
        f"Use the Login button, run `{JIMENG_LOGIN_COMMAND}`, or retry with `{JIMENG_DEBUG_LOGIN_COMMAND}` if the browser flow stalls. "
        f"CLI output: {detail}"
    )  # Keep installed-vs-auth state clear for setup UI.


def get_jimeng_setup_status() -> dict[str, object]:
    settings = get_settings()
    try:
        executable = _resolve_jimeng_executable(settings)
    except Exception as exc:
        return {
            "status": "missing_cli",
            "ready": False,
            "cliAvailable": False,
            "authenticated": False,
            "message": str(exc),
        }  # Missing executable is an install problem, not a login problem.

    try:
        result = _run_jimeng_command(["user_credit"], settings=settings, timeout_seconds=30)
    except Exception as exc:
        return {
            "status": "error",
            "ready": False,
            "cliAvailable": True,
            "authenticated": False,
            "executable": executable,
            "message": f"Jimeng CLI is installed, but the login self-check could not run: {exc}",
        }  # Preserve CLI presence even when the self-check itself fails.

    if result.returncode == 0:
        return {
            "status": "ready",
            "ready": True,
            "cliAvailable": True,
            "authenticated": True,
            "executable": executable,
            "message": "Jimeng CLI is ready",
        }  # user_credit success means install and login are both valid.

    return {
        "status": "login_required",
        "ready": False,
        "cliAvailable": True,
        "authenticated": False,
        "executable": executable,
        "message": _build_login_required_message(result),
        "detail": _format_command_failure(result),
    }  # A failed user_credit with an executable present means the CLI is installed.


def check_jimeng_health() -> dict[str, object]:
    status = get_jimeng_setup_status()
    if status.get("ready") is not True:
        raise RuntimeError(str(status.get("message") or "Jimeng CLI is not ready"))
    return status  # Generation requires both the executable and a valid login.


def clear_jimeng_cache() -> dict[str, object]:
    settings = get_settings()
    work_dir = settings.jimeng_work_dir
    resolved_work_dir = work_dir.resolve()
    protected_files: set[Path] = set()
    protected_dirs: set[Path] = set()
    deleted_files = 0
    bytes_freed = 0
    errors: list[str] = []
    if not work_dir.exists():
        return {
            "status": "ok",
            "deletedFiles": 0,
            "bytesFreed": 0,
            "workDir": str(work_dir),
            "errors": [],
        }  # Missing cache is already clean.
    _require_jimeng_cache_work_dir(settings)

    for job in jimeng_job_store.list_jobs():
        job_dir = (work_dir / job.id).resolve()
        if job.status in {"IN_QUEUE", "IN_PROGRESS"}:
            protected_dirs.add(job_dir)  # Running CLI jobs may still be writing into their job folder.
        if job.output_url and not _is_remote_url(job.output_url):
            resolved_output = Path(job.output_url).expanduser().resolve()
            try:
                resolved_output.relative_to(resolved_work_dir)
            except ValueError:
                continue  # Serving already rejects files outside the configured work dir.
            protected_files.add(resolved_output)  # Completed queue items should keep their local video.

    for path in work_dir.rglob("*"):
        if not path.is_file() or path.suffix.lower() not in VIDEO_EXTENSIONS:
            continue
        resolved_path = path.resolve()
        if resolved_path in protected_files:
            continue
        if any(resolved_path.is_relative_to(protected_dir) for protected_dir in protected_dirs):
            continue
        try:
            file_size = path.stat().st_size
            path.unlink()
            deleted_files += 1
            bytes_freed += file_size
        except OSError as exc:
            errors.append(f"{path}: {exc}")  # Keep individual file failures visible to the UI.

    return {
        "status": "ok" if not errors else "partial",
        "deletedFiles": deleted_files,
        "bytesFreed": bytes_freed,
        "workDir": str(work_dir),
        "errors": errors,
    }  # Clear generated videos without removing CLI install or login support files.


def install_or_update_jimeng_cli() -> dict[str, object]:
    settings = get_settings()
    install_dir = _get_local_jimeng_bin_dir(settings)
    _ensure_jimeng_work_dir(settings)  # Keep installer execution anchored in the backend work dir.
    install_dir.mkdir(parents=True, exist_ok=True)  # The installer expects its destination directory to exist.
    try:
        installer_response = urlopen(
            Request(
                JIMENG_INSTALL_URL,
                headers={
                    "Accept": "*/*",
                    "User-Agent": "Canva Banana Jimeng Setup/0.1",
                },
            ),
            timeout=60,
        )  # Fetch the official installer only after a user-triggered setup action.
        try:
            installer_script = installer_response.read()
        finally:
            installer_response.close()
    except HTTPError as exc:
        raise RuntimeError(f"Jimeng installer download failed with HTTP {exc.code}") from exc
    except URLError as exc:
        raise RuntimeError(f"Jimeng installer download failed: {exc.reason}") from exc

    completed = subprocess.run(
        ["bash"],
        input=installer_script,
        cwd=settings.jimeng_work_dir,
        env=_build_jimeng_subprocess_env(settings, install_dir=install_dir),
        capture_output=True,
        timeout=300,
        check=False,
    )  # Execute through bash without a shell command string or user-controlled arguments.
    stdout = completed.stdout.decode("utf-8", errors="replace") if completed.stdout else ""
    stderr = completed.stderr.decode("utf-8", errors="replace") if completed.stderr else ""
    combined_output = "\n".join(part for part in (stdout, stderr) if part).strip()
    if completed.returncode != 0:
        raise RuntimeError(f"Jimeng installer failed with exit code {completed.returncode}: {combined_output or 'No installer output.'}")
    return {
        "status": "ok",
        "message": "Jimeng CLI install/update completed",
        "output": combined_output[-4000:],
    }  # Return a bounded output tail for setup troubleshooting.


def start_jimeng_login(*, debug: bool = False) -> dict[str, object]:
    global _active_login_process
    settings = get_settings()
    executable = _resolve_jimeng_executable(settings)
    _ensure_jimeng_work_dir(settings)  # Login can write local task/config helpers.
    args = [executable, "login", *(["--debug"] if debug else [])]
    login_log_path = settings.jimeng_work_dir / f"login-{uuid4().hex}.log"
    with login_log_path.open("wb") as login_log:
        with _login_process_lock:
            if _active_login_process is not None and _active_login_process.poll() is None:
                return {
                    "status": "already_running",
                    "message": "Jimeng login is already running",
                    "pid": _active_login_process.pid,
                    "debug": debug,
                }  # Avoid stacking multiple browser auth flows from repeated clicks.
            process = subprocess.Popen(
                args,
                cwd=settings.jimeng_work_dir,
                env=_build_jimeng_subprocess_env(settings),
                stdin=subprocess.DEVNULL,
                stdout=login_log,
                stderr=subprocess.STDOUT,
                start_new_session=True,
            )  # Keep browser/manual auth output for the UI without blocking the API request.
            _active_login_process = process
        time.sleep(LOGIN_STARTUP_CAPTURE_SECONDS)
        return_code = process.poll()
        login_log.flush()

    output = login_log_path.read_text(encoding="utf-8", errors="replace") if login_log_path.exists() else ""
    auth_url = _extract_first_url(output)
    if return_code not in (None, 0):
        raise RuntimeError(f"Jimeng login failed with exit code {return_code}: {output or 'No login output.'}")

    message = "Jimeng login command is running"
    if auth_url:
        message = "Jimeng login URL is ready"
    elif return_code == 0:
        message = "Jimeng login command finished"
    return {
        "status": "started",
        "message": message,
        "pid": process.pid,
        "debug": debug,
        "authUrl": auth_url,
        "output": output[-4000:],
    }  # The UI should open authUrl when browser launch is not automatic.


def _validate_payload(payload: SeedanceJobPayload) -> None:
    if payload.model_id != JIMENG_MODEL_ID:
        raise ValueError(f"Unsupported Jimeng model: {payload.model_id}")  # Keep backend model ids explicit.
    if not payload.prompt.strip():
        raise ValueError("Prompt is required")  # dreamina video commands require text.
    if payload.variant not in {"smart", "reference"}:
        raise ValueError("Seedance 2 (JM CLI) supports Smart and Reference modes")
    if payload.ratio == "adaptive":
        raise ValueError("Seedance 2 (JM CLI) does not support adaptive aspect ratio yet")
    if payload.duration < 4 or payload.duration > 15:
        raise ValueError("Duration must be between 4 and 15 seconds")  # Match the existing Seedance UI range.
    model_version = payload.jimeng_model_version or JIMENG_DEFAULT_MODEL_VERSION
    if model_version not in JIMENG_SEEDANCE_MODEL_VERSIONS:
        raise ValueError(f"Unsupported Jimeng Seedance model_version: {model_version}")
    if payload.resolution == "1080p" and model_version != "seedance2.0_vip":
        raise ValueError("Seedance 2 (JM CLI) 1080p requires model_version seedance2.0_vip")
    if payload.last_frame_image:
        raise ValueError("Seedance 2 (JM CLI) does not support ending frames yet")
    if payload.variant == "reference" and not payload.primary_image and not payload.reference_images and not payload.reference_videos:
        raise ValueError("Seedance 2 (JM CLI) Reference requires at least one image or video reference")
    if payload.variant == "reference" and len(payload.reference_images) + (1 if payload.primary_image else 0) > 9:
        raise ValueError("Seedance 2 (JM CLI) Reference supports up to 9 image references")
    if payload.variant == "reference" and len(payload.reference_videos) > 3:
        raise ValueError("Seedance 2 (JM CLI) Reference supports up to 3 video references")
    if payload.variant == "reference" and len(payload.reference_audios) > 3:
        raise ValueError("Seedance 2 (JM CLI) Reference supports up to 3 audio references")
    if payload.variant == "smart" and (payload.reference_images or payload.reference_videos or payload.reference_audios):
        raise ValueError("Seedance 2 (JM CLI) Smart does not accept reference assets")


def _build_submit_command(payload: SeedanceJobPayload, settings: Settings) -> list[str]:
    poll_arg = f"--poll={settings.jimeng_submit_poll_seconds}"
    model_version = payload.jimeng_model_version or JIMENG_DEFAULT_MODEL_VERSION
    resolution = payload.resolution or "720p"
    if payload.variant == "reference":
        command = [
            "multimodal2video",
            f"--prompt={payload.prompt}",
            f"--duration={payload.duration}",
            f"--ratio={payload.ratio}",
            f"--video_resolution={resolution}",
            f"--model_version={model_version}",
            poll_arg,
        ]
        for media in ([payload.primary_image] if payload.primary_image else []):
            command.append(f"--image={media.temp_path}")
        command.extend(f"--image={media.temp_path}" for media in payload.reference_images)
        command.extend(f"--video={media.temp_path}" for media in payload.reference_videos)
        command.extend(f"--audio={media.temp_path}" for media in payload.reference_audios)
        return command  # multimodal2video is Dreamina's all-around reference mode.
    if payload.primary_image:
        return [
            "image2video",
            f"--image={payload.primary_image.temp_path}",
            f"--prompt={payload.prompt}",
            f"--duration={payload.duration}",
            f"--video_resolution={resolution}",
            f"--model_version={model_version}",
            poll_arg,
        ]  # Advanced image2video controls expose Seedance 2 model_version.
    return [
        "text2video",
        f"--prompt={payload.prompt}",
        f"--duration={payload.duration}",
        f"--ratio={payload.ratio}",
        f"--video_resolution={resolution}",
        f"--model_version={model_version}",
        poll_arg,
    ]  # Docs document model_version, ratio, and video_resolution for text2video.


def _wait_for_query_result(
    job_id: str,
    submit_id: str,
    *,
    settings: Settings,
    download_dir: Path,
) -> JimengParsedOutput:
    deadline = time.monotonic() + settings.jimeng_result_timeout_seconds
    last_output = ""
    while time.monotonic() < deadline:
        result = _run_jimeng_command(
            ["query_result", f"--submit_id={submit_id}", f"--download_dir={download_dir}"],
            settings=settings,
            timeout_seconds=120,
            cwd=download_dir,
        )
        last_output = result.combined_output
        _log(job_id, "Queried Jimeng result")
        _log_cli_output(job_id, "Jimeng query_result output", last_output)
        if result.returncode != 0:
            raise RuntimeError(_format_command_failure(result))
        parsed = _parse_jimeng_output(last_output, download_dir=download_dir)
        if parsed.output_url or parsed.output_path:
            return parsed
        if _is_failed_status(parsed.status):
            raise RuntimeError(parsed.error_message or last_output or "Jimeng task failed")
        time.sleep(settings.jimeng_query_interval_seconds)  # Leave the provider time to finish async jobs.
    raise TimeoutError(f"Jimeng task {submit_id} did not finish within {settings.jimeng_result_timeout_seconds} seconds. Last output: {last_output}")


def _execute_job(job_id: str, payload: SeedanceJobPayload) -> None:
    settings = get_settings()
    job_dir = settings.jimeng_work_dir / job_id
    download_dir = job_dir / "downloads"
    try:
        _ensure_jimeng_work_dir(settings)
        job_dir.mkdir(parents=True, exist_ok=True)
        download_dir.mkdir(parents=True, exist_ok=True)
        jimeng_job_store.update(job_id, status="IN_PROGRESS", updated_at=_now_ms())
        _log(job_id, "Preparing Jimeng CLI request")
        if payload.generate_audio:
            _log(job_id, "Jimeng CLI docs do not expose an audio toggle; using the documented video command")
        if payload.camera_fixed:
            _log(job_id, "Jimeng CLI docs do not expose a camera-fixed toggle; using the documented video command")

        submit_result = _run_jimeng_command(
            _build_submit_command(payload, settings),
            settings=settings,
            timeout_seconds=settings.jimeng_submit_poll_seconds + 120,
            cwd=job_dir,
        )
        if submit_result.returncode != 0:
            raise RuntimeError(_format_command_failure(submit_result))

        _log_cli_output(job_id, "Jimeng CLI output", submit_result.combined_output)
        parsed = _parse_jimeng_output(submit_result.combined_output, download_dir=download_dir, output_root_dir=job_dir)
        submit_id = parsed.submit_id
        if submit_id:
            jimeng_job_store.update(job_id, request_id=submit_id, remote_task_id=submit_id, updated_at=_now_ms())
            _log(job_id, f"Jimeng submit_id: {submit_id}")
        if _is_failed_status(parsed.status):
            raise RuntimeError(parsed.error_message or submit_result.combined_output or "Jimeng task failed")
        if not parsed.output_url and not parsed.output_path and submit_id:
            parsed = _wait_for_query_result(job_id, submit_id, settings=settings, download_dir=download_dir)
        if _is_failed_status(parsed.status):
            raise RuntimeError(parsed.error_message or submit_result.combined_output or "Jimeng task failed")

        output_url = parsed.output_url or (str(parsed.output_path) if parsed.output_path else None)
        if not output_url:
            detail = f" CLI output: {submit_result.combined_output}" if submit_result.combined_output else ""
            raise RuntimeError(f"Jimeng completed without a video URL or downloaded video file.{detail}")
        jimeng_job_store.update(
            job_id,
            status="COMPLETED",
            request_id=submit_id,
            remote_task_id=submit_id,
            output_url=output_url,
            updated_at=_now_ms(),
        )
        _log(job_id, "Video ready")
    except Exception as exc:
        jimeng_job_store.update(job_id, status="FAILED", error=str(exc), updated_at=_now_ms())
        _log(job_id, f"Worker error: {exc}")
    finally:
        payload.cleanup()  # Remove staged uploads after the CLI has copied or consumed them.


def create_jimeng_job(payload: SeedanceJobPayload) -> JobState:
    _validate_payload(payload)
    job_id = str(uuid4())  # Local queue id shown in the frontend list.
    created_at = _now_ms()
    job = JobState(
        id=job_id,
        model_id=payload.model_id,
        model_label=JIMENG_MODEL_LABEL,
        variant=payload.variant,
        prompt=payload.prompt,
        status="IN_QUEUE",
        created_at=created_at,
        updated_at=created_at,
    )
    jimeng_job_store.create(job)
    Thread(target=_execute_job, args=(job_id, payload), daemon=True).start()  # Keep CLI polling off the request thread.
    return job


def serialize_jimeng_job(
    job: JobState,
    *,
    output_url: str | None = None,
) -> dict[str, object]:
    raw_output_url = job.output_url
    return {
        "id": job.id,
        "modelId": job.model_id,
        "modelLabel": job.model_label,
        "variant": job.variant,
        "prompt": job.prompt,
        "status": job.status,
        "createdAt": job.created_at,
        "updatedAt": job.updated_at,
        "logs": list(job.logs),
        "requestId": job.request_id,
        "remoteTaskId": job.remote_task_id,
        "outputUrl": output_url if output_url is not None else raw_output_url,
        "providerOutputUrl": raw_output_url if _is_remote_url(raw_output_url) else None,
        "lastFrameUrl": None,
        "providerLastFrameUrl": None,
        "error": job.error,
        "provider": "jimeng",
    }  # Match the Volcengine job schema while preserving Jimeng as its own provider.
