from __future__ import annotations

import json
import math
import os
import re
import shutil
import subprocess
import time
from concurrent.futures import Future
from dataclasses import dataclass
from pathlib import Path
from threading import Lock, Thread, Timer
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen
from uuid import uuid4

from uvpython_service.config import Settings, get_settings
from uvpython_service.models import JobState, SeedanceJobPayload
from uvpython_service.store import JobStore

JIMENG_MODEL_ID = "jimeng-cli/seedance-2"  # Frontend selector id for the local Dreamina CLI.
JIMENG_SEEDANCE_25_MODEL_ID = "jimeng-cli/seedance-2.5"  # Separate selector because 2.5 has different limits.
JIMENG_MULTIFRAME_MODEL_ID = "jimeng-cli/multiframe"  # Intelligent multi-frame storytelling selector.
JIMENG_MODEL_LABEL = "Seedance 2 (JM CLI)"  # Queue and metadata label.
JIMENG_SEEDANCE_25_MODEL_LABEL = "Seedance 2.5 (JM CLI)"  # Keep provider identity visible beside Fal 2.5.
JIMENG_MULTIFRAME_MODEL_LABEL = "Jimeng Multi-frame"  # Fixed-model intelligent multi-frame workflow.
JIMENG_INSTALL_COMMAND = "curl -fsSL https://jimeng.jianying.com/cli | bash"  # Official install/update command.
JIMENG_INSTALL_URL = "https://jimeng.jianying.com/cli"  # Official installer script URL.
JIMENG_LOGIN_COMMAND = "dreamina login"  # Official login command (OAuth Device Flow).
JIMENG_EXECUTABLE_NAMES = ("dreamina", "jm")  # CLI names shipped by Jimeng over time.
VIDEO_EXTENSIONS = {".mp4", ".mov", ".m4v", ".webm"}  # Video formats the canvas loader can handle.
SUBMIT_ID_RE = re.compile(r"(?:submit_id|submitId)\s*[=:]\s*\"?([A-Za-z0-9._:-]+)\"?", re.IGNORECASE)  # Fallback for text logs.
VIDEO_URL_KEYS = {"video_url", "videourl", "output_url", "outputurl", "download_url", "downloadurl", "result_url", "resulturl", "url"}  # Only result-like URL fields can complete a job.
JIMENG_SEEDANCE_MODEL_VERSIONS = {"seedance2.0fast", "seedance2.0", "seedance2.0_vip", "seedance2.0fast_vip", "seedance2.0mini", "seedance2.5"}  # CLI --model_version values.
JIMENG_DEFAULT_MODEL_VERSION = "seedance2.0fast"  # Matches dreamina text2video help default.
JIMENG_20_REFERENCE_LIMITS = {"image": 9, "video": 3, "audio": 3, "total": 12, "duration": 15.0}  # Seedance 2 reference limits.
JIMENG_25_REFERENCE_LIMITS = {"image": 30, "video": 10, "audio": 10, "total": 50, "duration": 30.0}  # Seedance 2.5 reference limits.
JIMENG_LOGIN_SESSION_TTL_SECONDS = 900.0  # Device Flow codes are short-lived and should not remain in memory indefinitely.
JIMENG_UPLOAD_TIMEOUT_BYTES_PER_SECOND = 64 * 1024  # Allow large submissions to upload over a slow 512 Kbps connection.
JIMENG_WORK_DIR_SENTINEL = ".canva-banana-jimeng-work-dir"  # Refuse cache deletes from broad user-selected folders.

jimeng_job_store = JobStore()  # Jimeng jobs stay separate from Volcengine jobs.
_login_process_lock = Lock()  # Protect active Device Flow sessions and their expiry timer.
_login_start_lock = Lock()  # Protect the shared in-flight Device Flow launch.
_login_start_inflight: Future[dict[str, object]] | None = None  # Concurrent callers share one returned session.
_active_login_sessions: dict[str, tuple[str, float]] = {}  # Map opaque app session ids to device codes and expiry times.
_login_expiry_timer: Timer | None = None  # At most one Device Flow session is active, so one expiry timer is sufficient.
_capability_cache_lock = Lock()  # Prevent concurrent setup checks from repeating the same CLI help probes.
_cached_capability_fingerprint: tuple[str, int, int, int, int] | None = None  # Path and file metadata identify the exact CLI build.
_cached_missing_capability: str | None = None  # None means the cached executable supports every required command.


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


@dataclass(frozen=True)
class JimengLoginMaterial:
    verification_uri: str
    user_code: str
    device_code: str


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
    executable: str | None = None,
) -> JimengCommandResult:
    resolved_executable = executable or _resolve_jimeng_executable(settings)
    working_dir = cwd or settings.jimeng_work_dir
    _ensure_jimeng_work_dir(settings)
    working_dir.mkdir(parents=True, exist_ok=True)  # The CLI needs a place for downloads and temp files.
    try:
        completed = subprocess.run(
            [resolved_executable, *args],
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
    if "AigcComplianceConfirmationRequired" in detail:
        return (
            "Jimeng requires a first generation with this model on the Dreamina website before CLI use. "
            f"After completing it on the web, retry this request. CLI output: {detail}"
        )
    return f"Jimeng CLI failed with exit code {result.returncode}: {detail}"  # Include enough output for user-side troubleshooting.


def _is_failed_status(status: str | None) -> bool:
    return status == "failed"  # Normalize CLI fail/failed variants in one place.


def _log_cli_output(job_id: str, label: str, output: str) -> None:
    if not output.strip():
        return
    output_tail = output.strip()[-2000:]
    _log(job_id, f"{label}: {output_tail}")  # Keep enough raw CLI output to debug provider-side failures.


def _build_login_required_message(result: JimengCommandResult) -> str:
    detail = _format_command_failure(result)
    return (
        "Jimeng CLI is installed, but no valid login is available. "
        f"Use the Login button or run `{JIMENG_LOGIN_COMMAND}` to complete OAuth Device Flow. "
        f"CLI output: {detail}"
    )  # Keep installed-vs-auth state clear for setup UI.


def _read_jimeng_release_version() -> str | None:
    version_path = Path.home() / ".dreamina_cli" / "version.json"
    try:
        payload = json.loads(version_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None
    version = payload.get("version") if isinstance(payload, dict) else None
    return version.strip() if isinstance(version, str) and version.strip() else None  # Installer metadata carries the semantic release.


def _is_installer_managed_jimeng_executable(executable: str, settings: Settings) -> bool:
    resolved_executable = Path(executable).expanduser().resolve()
    managed_executables = (
        _get_local_jimeng_bin_dir(settings) / "dreamina",
        Path.home() / ".local" / "bin" / "dreamina",
    )
    return any(resolved_executable == candidate.resolve() for candidate in managed_executables)  # Only these binaries share the installer's version file.


def _get_unmanaged_jimeng_cli_override(settings: Settings) -> str | None:
    explicit_path = settings.jimeng_cli_path
    if not explicit_path:
        return None
    if explicit_path == "dreamina":
        return None  # The managed install directory takes priority when this command name is resolved again.
    try:
        resolved_executable = _resolve_jimeng_executable(settings)
    except RuntimeError:
        expanded_path = Path(explicit_path).expanduser()
        if _is_installer_managed_jimeng_executable(str(expanded_path), settings):
            return None  # The installer can satisfy its own explicit destination.
        return str(expanded_path)
    return None if _is_installer_managed_jimeng_executable(resolved_executable, settings) else resolved_executable


def _is_supported_jimeng_release(version: str) -> bool:
    match = re.fullmatch(r"(\d+)\.(\d+)\.(\d+)", version)
    return bool(match and tuple(int(part) for part in match.groups()) >= (1, 4, 15))


def _get_missing_jimeng_cli_capability(executable: str, settings: Settings) -> str | None:
    capability_checks = (
        (["login", "-h"], ("--headless", "checklogin"), "OAuth Device Flow login"),
        (["text2video", "-h"], ("seedance2.5",), "Seedance 2.5 video"),
        (["multiframe2video", "-h"], ("--transition-prompt", "--video_resolution"), "Multi-frame video"),
        (["frames2video", "-h"], (), "First/last-frame video"),  # Command presence alone proves the build supports end frames.
    )
    for args, required_markers, capability_label in capability_checks:
        result = _run_jimeng_command(args, settings=settings, timeout_seconds=30, executable=executable)
        if result.returncode != 0 or any(marker not in result.combined_output for marker in required_markers):
            return capability_label
    return None  # Readiness follows the exact executable's commands, not shared release metadata.


def _get_jimeng_executable_fingerprint(executable: str) -> tuple[str, int, int, int, int]:
    executable_path = Path(executable).expanduser().resolve()
    try:
        stat_result = executable_path.stat()
    except OSError:
        return (str(executable_path), -1, -1, -1, -1)  # The capability probe will surface a missing or unreadable binary.
    return (
        str(executable_path),
        stat_result.st_ino,
        stat_result.st_size,
        stat_result.st_mtime_ns,
        stat_result.st_ctime_ns,
    )  # Replacements and in-place updates both invalidate the cached help result.


def _clear_jimeng_capability_cache() -> None:
    global _cached_capability_fingerprint, _cached_missing_capability
    with _capability_cache_lock:
        _cached_capability_fingerprint = None
        _cached_missing_capability = None


def _get_cached_missing_jimeng_cli_capability(executable: str, settings: Settings) -> str | None:
    global _cached_capability_fingerprint, _cached_missing_capability
    fingerprint = _get_jimeng_executable_fingerprint(executable)
    with _capability_cache_lock:
        if _cached_capability_fingerprint == fingerprint:
            return _cached_missing_capability
        missing_capability = _get_missing_jimeng_cli_capability(executable, settings)
        _cached_capability_fingerprint = fingerprint
        _cached_missing_capability = missing_capability
        return missing_capability  # Static help output remains valid until the executable changes.


def _find_json_string(text: str, keys: set[str]) -> str | None:
    for json_value in _iter_json_values(text):
        for key, value in _iter_json_strings(json_value):
            if key.lower() in keys and value.strip():
                return value.strip()
    return None  # Device Flow output is JSON in current releases but may be surrounded by logs.


def _parse_login_material(text: str) -> JimengLoginMaterial | None:
    verification_uri = _find_json_string(text, {"verification_uri", "verificationuri", "verification_url"})  # CLI output shares the configured executable's trust boundary.
    user_code = _find_json_string(text, {"user_code", "usercode"})
    device_code = _find_json_string(text, {"device_code", "devicecode"})
    if verification_uri and user_code and device_code:
        return JimengLoginMaterial(verification_uri=verification_uri, user_code=user_code, device_code=device_code)

    def find_value(label: str) -> str | None:
        match = re.search(rf"{label}\s*[=:]\s*[\"']?([^\s\"']+)", text, flags=re.IGNORECASE)
        return match.group(1).strip() if match else None

    verification_uri = find_value("verification_uri")
    user_code = find_value("user_code")
    device_code = find_value("device_code")
    if verification_uri and user_code and device_code:
        return JimengLoginMaterial(verification_uri=verification_uri, user_code=user_code, device_code=device_code)
    return None  # Fail closed instead of exposing unparsed login output containing a device code.


def _redact_jimeng_login_secret(text: str, device_code: str) -> str:
    return text.replace(device_code, "[redacted]") if text and device_code else text  # Never return the backend-only Device Flow secret.


def _redact_jimeng_device_codes(text: str) -> str:
    return re.sub(
        r"(?i)(device_?code[\"']?\s*[=:]\s*[\"']?)[^\s\"',}]+",
        r"\1[redacted]",
        text,
    )  # Cover the snake_case and camelCase spellings accepted by the login parser.

def _expire_jimeng_login_session(login_session_id: str, expires_at: float) -> None:
    with _login_process_lock:
        login_material = _active_login_sessions.get(login_session_id)
        if login_material and login_material[1] == expires_at:
            _active_login_sessions.pop(login_session_id, None)  # Never let an abandoned Device Flow secret outlive its TTL.


def _activate_jimeng_login_session(login_session_id: str, device_code: str, expires_at: float) -> None:
    global _login_expiry_timer
    expiry_timer = Timer(
        max(0.0, expires_at - time.monotonic()),
        _expire_jimeng_login_session,
        args=(login_session_id, expires_at),
    )
    expiry_timer.daemon = True
    with _login_process_lock:
        _active_login_sessions.clear()  # Only the newest setup attempt should remain pollable.
        _active_login_sessions[login_session_id] = (device_code, expires_at)
        if _login_expiry_timer:
            _login_expiry_timer.cancel()
        _login_expiry_timer = expiry_timer  # Publish the active session and its matching timer atomically.
    expiry_timer.start()


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
        result = _run_jimeng_command(["user_credit"], settings=settings, timeout_seconds=30, executable=executable)
    except Exception as exc:
        return {
            "status": "error",
            "ready": False,
            "cliAvailable": True,
            "authenticated": False,
            "executable": executable,
            "message": f"Jimeng CLI is installed, but the login self-check could not run: {exc}",
        }  # Preserve CLI presence even when the self-check itself fails.

    is_installer_managed = _is_installer_managed_jimeng_executable(executable, settings)
    release_version = _read_jimeng_release_version() if is_installer_managed else None
    try:
        missing_capability = _get_cached_missing_jimeng_cli_capability(executable, settings)
    except Exception as exc:
        return {
            "status": "error",
            "ready": False,
            "cliAvailable": True,
            "authenticated": result.returncode == 0,
            "executable": executable,
            "cliVersion": release_version,
            "message": f"Jimeng CLI is installed, but the capability check could not run: {exc}",
        }  # Probe failures (timeouts, mid-install binary swaps) are an error state, not a 500.
    compatibility_error: str | None = None
    if missing_capability and release_version is not None and not _is_supported_jimeng_release(release_version):
        compatibility_error = f"Jimeng CLI {release_version} is outdated. Install version 1.4.15 or newer before generating."
    elif missing_capability and not is_installer_managed:
        compatibility_error = (
            f"The Jimeng CLI at {executable} is missing {missing_capability} support. "
            "Update it to Dreamina CLI 1.4.15 or newer, or use the in-app installer to install a managed copy. "
            "If JIMENG_CLI_PATH points at this executable, unset it and restart the app first."
        )  # The binary may come from PATH rather than JIMENG_CLI_PATH, so do not assume the override is set.
    elif missing_capability:
        compatibility_error = f"The installed Jimeng CLI is missing {missing_capability} support. Reinstall Dreamina CLI 1.4.15 or newer before generating."
    elif release_version is not None and not _is_supported_jimeng_release(release_version):
        release_version = None  # A capable exact executable proves that shared installer metadata belongs to another install.
    if compatibility_error:
        return {
            "status": "update_required",
            "ready": False,
            "cliAvailable": True,
            "authenticated": result.returncode == 0,
            "executable": executable,
            "cliVersion": release_version,
            "message": compatibility_error,
        }
    if result.returncode == 0:
        return {
            "status": "ready",
            "ready": True,
            "cliAvailable": True,
            "authenticated": True,
            "executable": executable,
            "cliVersion": release_version,
            "message": "Jimeng CLI is ready",
        }  # user_credit success means install and login are both valid.

    return {
        "status": "login_required",
        "ready": False,
        "cliAvailable": True,
        "authenticated": False,
        "executable": executable,
        "cliVersion": release_version,
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
    protected_dirs: set[Path] = set()
    local_output_job_ids: dict[Path, list[str]] = {}
    deleted_files = 0
    bytes_freed = 0
    errors: list[str] = []
    invalidated_job_ids: list[str] = []
    if not work_dir.exists():
        return {
            "status": "ok",
            "deletedFiles": 0,
            "bytesFreed": 0,
            "workDir": str(work_dir),
            "errors": [],
            "invalidatedJobIds": [],
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
            local_output_job_ids.setdefault(resolved_output, []).append(job.id)  # Clear stale output pointers after deleting their cached file.

    for path in work_dir.rglob("*"):
        if not path.is_file() or path.suffix.lower() not in VIDEO_EXTENSIONS:
            continue
        resolved_path = path.resolve()
        if any(resolved_path.is_relative_to(protected_dir) for protected_dir in protected_dirs):
            continue
        try:
            file_size = path.stat().st_size
            path.unlink()
            deleted_files += 1
            bytes_freed += file_size
            for job_id in local_output_job_ids.get(resolved_path, []):
                jimeng_job_store.update(job_id, output_url=None, updated_at=_now_ms())  # Do not advertise a local output after the user clears it.
                invalidated_job_ids.append(job_id)
        except OSError as exc:
            errors.append(f"{path}: {exc}")  # Keep individual file failures visible to the UI.

    return {
        "status": "ok" if not errors else "partial",
        "deletedFiles": deleted_files,
        "bytesFreed": bytes_freed,
        "workDir": str(work_dir),
        "errors": errors,
        "invalidatedJobIds": invalidated_job_ids,
    }  # Clear generated videos without removing CLI install or login support files.


def install_or_update_jimeng_cli() -> dict[str, object]:
    settings = get_settings()
    unmanaged_override = _get_unmanaged_jimeng_cli_override(settings)
    if unmanaged_override:
        raise RuntimeError(
            f"The in-app installer cannot update the Jimeng CLI configured by JIMENG_CLI_PATH at {unmanaged_override}. "
            "Update that executable directly, or unset JIMENG_CLI_PATH and restart the app before using Install."
        )  # Installing another binary would not help because the configured override remains preferred.
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
    _clear_jimeng_capability_cache()  # Force the next setup check to inspect the newly installed executable.
    return {
        "status": "ok",
        "message": "Jimeng CLI install/update completed",
        "output": combined_output[-4000:],
    }  # Return a bounded output tail for setup troubleshooting.


def _launch_jimeng_login() -> dict[str, object]:
    settings = get_settings()
    try:
        result = _run_jimeng_command(["login", "--headless"], settings=settings, timeout_seconds=30)
    except Exception as exc:
        raise RuntimeError(_redact_jimeng_device_codes(str(exc))) from exc
    if result.returncode != 0:
        raise RuntimeError(_redact_jimeng_device_codes(_format_command_failure(result)))
    material = _parse_login_material(result.combined_output)
    if material is None:
        status = get_jimeng_setup_status()
        if status.get("ready") is True:
            return {"status": "ready", "message": "Jimeng login is already valid"}
        raise RuntimeError("Jimeng login did not return OAuth Device Flow verification material")

    login_session_id = uuid4().hex
    expires_at = time.monotonic() + JIMENG_LOGIN_SESSION_TTL_SECONDS
    _activate_jimeng_login_session(login_session_id, material.device_code, expires_at)
    return {
        "status": "authorization_required",
        "message": "Open the verification page and enter the displayed code",
        "loginSessionId": login_session_id,
        "verificationUri": material.verification_uri,
        "userCode": material.user_code,
    }  # Keep the sensitive device code in the backend process.


def start_jimeng_login() -> dict[str, object]:
    global _login_start_inflight
    with _login_start_lock:
        inflight = _login_start_inflight
        should_launch = inflight is None
        if inflight is None:
            inflight = Future()
            _login_start_inflight = inflight
    if not should_launch:
        return inflight.result()  # Every overlapping request receives the same usable session.

    try:
        response = _launch_jimeng_login()
    except BaseException as exc:
        inflight.set_exception(exc)
        raise
    else:
        inflight.set_result(response)
        return response
    finally:
        with _login_start_lock:
            if _login_start_inflight is inflight:
                _login_start_inflight = None


def check_jimeng_login(login_session_id: str, *, poll_seconds: int = 30) -> dict[str, object]:
    with _login_process_lock:
        login_material = _active_login_sessions.get(login_session_id)
        if login_material and login_material[1] <= time.monotonic():
            _active_login_sessions.pop(login_session_id, None)
            login_material = None
    if not login_material:
        raise ValueError("Jimeng login session is missing or expired")
    device_code = login_material[0]
    settings = get_settings()
    bounded_poll_seconds = max(0, min(poll_seconds, 60))
    try:
        result = _run_jimeng_command(
            ["login", "checklogin", f"--device_code={device_code}", f"--poll={bounded_poll_seconds}"],
            settings=settings,
            timeout_seconds=bounded_poll_seconds + 30,
        )
    except Exception as exc:
        safe_detail = _redact_jimeng_login_secret(str(exc), device_code)
        raise RuntimeError(safe_detail) from exc  # Endpoint errors must not expose the backend-owned device code.
    if result.returncode != 0:
        detail = _redact_jimeng_login_secret(result.combined_output, device_code)
        if "login expired" in detail.lower() or "过期" in detail:
            with _login_process_lock:
                _active_login_sessions.pop(login_session_id, None)  # A dead device code cannot become authorized later.
            raise ValueError("Jimeng login expired before authorization completed. Start a new login from the setup panel.")
        message = "Waiting for Jimeng authorization"
        if detail:
            message = f"{message} (CLI: {detail[-200:]})"  # Keep genuine CLI errors visible while the session stays pollable.
        return {"status": "pending", "ready": False, "message": message}  # The CLI exits non-zero when the poll window elapses, which is not a hard failure.
    status = get_jimeng_setup_status()
    if status.get("ready") is True:
        with _login_process_lock:
            _active_login_sessions.pop(login_session_id, None)
        return {"status": "ready", "ready": True, "message": "Jimeng login completed"}
    if status.get("status") != "login_required":
        with _login_process_lock:
            _active_login_sessions.pop(login_session_id, None)  # Authorization finished; only account-check lag remains pollable.
        return status  # Preserve update, install, and capability failures after authorization completes.
    return {"status": "pending", "ready": False, "message": "Waiting for Jimeng authorization"}  # Reachable when the account check lags behind a completed authorization.


def _validate_payload(payload: SeedanceJobPayload) -> None:
    supported_model_ids = {JIMENG_MODEL_ID, JIMENG_SEEDANCE_25_MODEL_ID, JIMENG_MULTIFRAME_MODEL_ID}
    if payload.model_id not in supported_model_ids:
        raise ValueError(f"Unsupported Jimeng model: {payload.model_id}")  # Keep backend model ids explicit.
    if payload.session_id < 0:
        raise ValueError("Jimeng session id must be zero or greater")
    is_multiframe_model = payload.model_id == JIMENG_MULTIFRAME_MODEL_ID
    is_multiframe_mode = payload.jimeng_mode == "multiframe"
    if is_multiframe_model != is_multiframe_mode:
        raise ValueError("Jimeng Multi-frame model and mode must be selected together")
    if is_multiframe_model:
        _validate_multiframe_payload(payload)
        return
    if payload.multiframe_images or payload.transition_prompts or payload.transition_durations:
        raise ValueError("Jimeng Multi-frame inputs require the Multi-frame model and mode")  # Auto mode would silently drop them.
    if payload.variant not in {"smart", "reference"}:
        raise ValueError("Seedance 2 (JM CLI) supports Smart and Reference modes")
    if payload.ratio == "adaptive":
        raise ValueError("Seedance 2 (JM CLI) does not support adaptive aspect ratio yet")
    model_version = payload.jimeng_model_version or JIMENG_DEFAULT_MODEL_VERSION
    if model_version not in JIMENG_SEEDANCE_MODEL_VERSIONS:
        raise ValueError(f"Unsupported Jimeng Seedance model_version: {model_version}")
    if payload.model_id == JIMENG_SEEDANCE_25_MODEL_ID and model_version != "seedance2.5":
        raise ValueError("Seedance 2.5 (JM CLI) requires model_version seedance2.5")
    if payload.model_id == JIMENG_MODEL_ID and model_version == "seedance2.5":
        raise ValueError("Use the Seedance 2.5 (JM CLI) model for model_version seedance2.5")

    max_duration = 30 if model_version == "seedance2.5" else 15
    if payload.duration < 4 or payload.duration > max_duration:
        raise ValueError(f"Duration must be between 4 and {max_duration} seconds for {model_version}")
    allowed_resolutions = (
        {"480p", "720p"}
        if model_version == "seedance2.5"
        else {"720p", "1080p", "4k"}
        if model_version == "seedance2.0_vip"
        else {"720p"}
    )
    if payload.resolution not in allowed_resolutions:
        allowed_label = ", ".join(sorted(allowed_resolutions))
        raise ValueError(f"{model_version} supports video_resolution: {allowed_label}")
    if payload.variant == "smart" and not payload.prompt.strip():
        raise ValueError("Prompt is required for Jimeng text, image, and first/last-frame video")
    if payload.last_frame_image and not payload.primary_image:
        raise ValueError("Jimeng first/last-frame mode requires a first-frame image")
    if payload.variant == "reference":
        if payload.last_frame_image:
            raise ValueError("Jimeng Reference does not accept an ending frame")
        limits = JIMENG_25_REFERENCE_LIMITS if model_version == "seedance2.5" else JIMENG_20_REFERENCE_LIMITS
        image_count = len(payload.reference_images) + (1 if payload.primary_image else 0)
        total_count = image_count + len(payload.reference_videos) + len(payload.reference_audios)
        has_visual_reference = image_count > 0 or bool(payload.reference_videos)
        if not has_visual_reference and not (model_version == "seedance2.5" and payload.reference_audios):
            raise ValueError("Jimeng Reference requires an image or video; Seedance 2.5 also permits audio-only input")
        if image_count > limits["image"]:
            raise ValueError(f"{model_version} Reference supports up to {limits['image']} image references")
        if len(payload.reference_videos) > limits["video"]:
            raise ValueError(f"{model_version} Reference supports up to {limits['video']} video references")
        if len(payload.reference_audios) > limits["audio"]:
            raise ValueError(f"{model_version} Reference supports up to {limits['audio']} audio references")
        if total_count > limits["total"]:
            raise ValueError(f"{model_version} Reference supports up to {limits['total']} total inputs")
        _validate_jimeng_reference_durations(payload.reference_videos, limits["duration"], "videos", model_version)
        _validate_jimeng_reference_durations(payload.reference_audios, limits["duration"], "audio clips", model_version)
    if payload.variant == "smart" and (payload.reference_images or payload.reference_videos or payload.reference_audios):
        raise ValueError("Seedance 2 (JM CLI) Smart does not accept reference assets")


def _validate_jimeng_reference_durations(
    media_items: list[MediaInput],
    max_duration_seconds: float,
    media_label: str,
    model_version: str,
) -> None:
    if not media_items or any(media.duration_probe_skipped for media in media_items):
        return
    total_duration = 0.0
    for media in media_items:
        duration = media.duration_seconds
        if duration is None or not math.isfinite(duration):
            raise ValueError(f"Could not read {model_version} reference duration for {media.file_name}")
        if duration < 1.95 or duration > max_duration_seconds + 0.05:
            raise ValueError(f"{model_version} reference {media_label} must each be between 2 and {int(max_duration_seconds)} seconds")
        total_duration += duration
    if total_duration > max_duration_seconds + 0.05:
        raise ValueError(f"{model_version} reference {media_label} must total {int(max_duration_seconds)} seconds or less")


def _validate_multiframe_payload(payload: SeedanceJobPayload) -> None:
    if payload.primary_image or payload.last_frame_image or payload.reference_images or payload.reference_videos or payload.reference_audios:
        raise ValueError("Jimeng Multi-frame only accepts its frame images")  # multiframe2video has no flags for other media.
    image_count = len(payload.multiframe_images)
    if image_count < 2 or image_count > 20:
        raise ValueError("Jimeng Multi-frame requires between 2 and 20 images")
    if payload.resolution not in {"720p", "1080p"}:
        raise ValueError("Jimeng Multi-frame supports video_resolution 720p or 1080p")
    transition_count = image_count - 1
    if image_count == 2:
        if not payload.prompt.strip():
            raise ValueError("Jimeng two-image Multi-frame requires a prompt")
        if payload.duration < 2 or payload.duration > 8:
            raise ValueError("Jimeng two-image Multi-frame duration must be between 2 and 8 seconds")
        if payload.transition_prompts or payload.transition_durations:
            raise ValueError("Jimeng two-image Multi-frame uses prompt and duration instead of transition settings")
        return
    if len(payload.transition_prompts) != transition_count or any(not prompt.strip() for prompt in payload.transition_prompts):
        raise ValueError(f"Jimeng Multi-frame requires {transition_count} transition prompts for {image_count} images")
    if payload.transition_durations:
        if len(payload.transition_durations) != transition_count:
            raise ValueError(f"Jimeng Multi-frame requires {transition_count} transition durations when durations are provided")
        if any(not math.isfinite(duration) or duration < 1 or duration > 8 for duration in payload.transition_durations):
            raise ValueError("Jimeng Multi-frame transition durations must each be between 1 and 8 seconds")
        if sum(payload.transition_durations) < 2:
            raise ValueError("Jimeng Multi-frame total duration must be at least 2 seconds")


def _build_submit_command(payload: SeedanceJobPayload, settings: Settings) -> list[str]:
    poll_arg = f"--poll={settings.jimeng_submit_poll_seconds}"
    model_version = payload.jimeng_model_version or JIMENG_DEFAULT_MODEL_VERSION
    resolution = payload.resolution or "720p"
    session_arg = f"--session={payload.session_id}"
    if payload.model_id == JIMENG_MULTIFRAME_MODEL_ID or payload.jimeng_mode == "multiframe":
        command = [
            "multiframe2video",
            f"--images={','.join(str(media.temp_path) for media in payload.multiframe_images)}",
            f"--video_resolution={resolution}",
            session_arg,
            poll_arg,
        ]
        if len(payload.multiframe_images) == 2:
            command.extend([f"--prompt={payload.prompt}", f"--duration={payload.duration}"])
        else:
            command.extend(f"--transition-prompt={prompt}" for prompt in payload.transition_prompts)
            command.extend(f"--transition-duration={duration:g}" for duration in payload.transition_durations)
        return command
    if payload.variant == "reference":
        command = [
            "multimodal2video",
            f"--duration={payload.duration}",
            f"--ratio={payload.ratio}",
            f"--video_resolution={resolution}",
            f"--model_version={model_version}",
            session_arg,
            poll_arg,
        ]
        if payload.prompt.strip():
            command.insert(1, f"--prompt={payload.prompt}")
        for media in ([payload.primary_image] if payload.primary_image else []):
            command.append(f"--image={media.temp_path}")
        command.extend(f"--image={media.temp_path}" for media in payload.reference_images)
        command.extend(f"--video={media.temp_path}" for media in payload.reference_videos)
        command.extend(f"--audio={media.temp_path}" for media in payload.reference_audios)
        return command  # multimodal2video is Dreamina's all-around reference mode.
    if payload.primary_image and payload.last_frame_image:
        return [
            "frames2video",
            f"--first={payload.primary_image.temp_path}",
            f"--last={payload.last_frame_image.temp_path}",
            f"--prompt={payload.prompt}",
            f"--duration={payload.duration}",
            f"--video_resolution={resolution}",
            f"--model_version={model_version}",
            session_arg,
            poll_arg,
        ]  # First and last images map directly to the CLI frames command.
    if payload.primary_image:
        return [
            "image2video",
            f"--image={payload.primary_image.temp_path}",
            f"--prompt={payload.prompt}",
            f"--duration={payload.duration}",
            f"--video_resolution={resolution}",
            f"--model_version={model_version}",
            session_arg,
            poll_arg,
        ]  # Advanced image2video controls expose Seedance 2 model_version.
    return [
        "text2video",
        f"--prompt={payload.prompt}",
        f"--duration={payload.duration}",
        f"--ratio={payload.ratio}",
        f"--video_resolution={resolution}",
        f"--model_version={model_version}",
        session_arg,
        poll_arg,
    ]  # Docs document model_version, ratio, and video_resolution for text2video.


def _get_submit_timeout_seconds(payload: SeedanceJobPayload, settings: Settings) -> int:
    total_media_bytes = sum(max(0, media.size_bytes) for media in payload.iter_media_inputs())
    upload_allowance_seconds = math.ceil(total_media_bytes / JIMENG_UPLOAD_TIMEOUT_BYTES_PER_SECOND)
    command_baseline_seconds = max(settings.jimeng_submit_timeout_seconds, settings.jimeng_submit_poll_seconds + 120)
    return command_baseline_seconds + upload_allowance_seconds  # Keep upload time independent while honoring the configured initial poll.


def _wait_for_query_result(
    job_id: str,
    submit_id: str,
    *,
    settings: Settings,
    download_dir: Path,
    result_timeout_seconds: int | None = None,
) -> JimengParsedOutput:
    effective_timeout_seconds = result_timeout_seconds or settings.jimeng_result_timeout_seconds
    deadline = time.monotonic() + effective_timeout_seconds
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
    raise TimeoutError(f"Jimeng task {submit_id} did not finish within {effective_timeout_seconds} seconds. Last output: {last_output}")


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
            timeout_seconds=_get_submit_timeout_seconds(payload, settings),
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
            result_timeout_seconds = settings.jimeng_result_timeout_seconds * 2 if payload.jimeng_model_version == "seedance2.5" else settings.jimeng_result_timeout_seconds
            parsed = _wait_for_query_result(job_id, submit_id, settings=settings, download_dir=download_dir, result_timeout_seconds=result_timeout_seconds)
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
    model_label = (
        JIMENG_SEEDANCE_25_MODEL_LABEL
        if payload.model_id == JIMENG_SEEDANCE_25_MODEL_ID
        else JIMENG_MULTIFRAME_MODEL_LABEL
        if payload.model_id == JIMENG_MULTIFRAME_MODEL_ID
        else JIMENG_MODEL_LABEL
    )
    job = JobState(
        id=job_id,
        model_id=payload.model_id,
        model_label=model_label,
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
