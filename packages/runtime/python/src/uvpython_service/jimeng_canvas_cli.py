from __future__ import annotations

import hashlib
import json
import math
import os
import re
import shutil
import subprocess
import time
from collections.abc import Sequence
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from threading import Lock
from typing import Literal
from urllib.error import HTTPError, URLError
from urllib.parse import parse_qsl, urlsplit
from urllib.request import Request, urlopen
from uuid import uuid4

from uvpython_service.config import get_settings

CANVAS_INSTALL_URL = "https://jimeng.jianying.com/canvas-cli/install.sh"
CANVAS_PROFILE = "canva-banana"
_LOGIN_TTL_SECONDS = 900
_START_LOGIN_LOCK = Lock()
_SESSIONS_LOCK = Lock()


class CanvasCliError(RuntimeError):
    def __init__(self, message: str, *, exit_code: int = 1) -> None:
        super().__init__(message)
        self.exit_code = exit_code


@dataclass
class _LoginSession:
    device_code: str
    expires_at: float
    state_dir: str
    authorization: dict[str, object]
    lock: Lock = field(default_factory=Lock)


_LOGIN_SESSIONS: dict[str, _LoginSession] = {}


def _root_dir() -> Path:
    return get_settings().jimeng_canvas_root_dir


def _state_dir() -> Path:
    explicit = os.environ.get("DREAMINA_CANVAS_STATE_DIR", "").strip()
    return Path(explicit).expanduser() if explicit else _root_dir() / "state"


def _profile() -> str:
    value = os.environ.get("JIMENG_CANVAS_PROFILE", "").strip() or CANVAS_PROFILE
    if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._-]{0,63}", value):
        raise CanvasCliError("JIMENG_CANVAS_PROFILE must be a short profile name.", exit_code=2)
    return value


def _session_scope() -> str:
    return json.dumps([str(_state_dir().resolve()), _profile()])


def _environment() -> dict[str, str]:
    env = os.environ.copy()
    env["DREAMINA_CANVAS_STATE_DIR"] = str(_state_dir())
    env["DREAMINA_CANVAS_INSTALL_DIR"] = str(_root_dir() / "bin")
    env["DREAMINA_CANVAS_SKILL_DIR"] = str(_root_dir() / "skills")
    directories = [
        _root_dir() / "bin", Path.home() / ".local/bin", Path.home() / "bin",
        Path("/opt/homebrew/bin"), Path("/usr/local/bin"), Path("/usr/bin"), Path("/bin"),
    ]
    env["PATH"] = os.pathsep.join([*(str(path) for path in directories), env.get("PATH", "")])
    return env


def _resolve_executable() -> str:
    override = os.environ.get("JIMENG_CANVAS_CLI_PATH", "").strip()
    found = shutil.which(override or "dreamina-canvas", path=_environment()["PATH"])
    if not found:
        raise CanvasCliError("Jimeng Canvas CLI is unavailable. Install it in setup or configure JIMENG_CANVAS_CLI_PATH.")
    return found


def run_canvas(args: Sequence[str], *, timeout_seconds: float = 60) -> dict[str, object]:
    executable = _resolve_executable()
    root = _root_dir()
    root.mkdir(parents=True, exist_ok=True)
    _state_dir().mkdir(parents=True, exist_ok=True, mode=0o700)
    try:
        completed = subprocess.run(
            [executable, "--format", "json", "--non-interactive", "--profile", _profile(), *args],
            cwd=root,
            env=_environment(),
            capture_output=True,
            text=True,
            timeout=timeout_seconds,
            check=False,
        )
    except subprocess.TimeoutExpired:
        raise CanvasCliError("Jimeng Canvas CLI is still waiting. Check the recorded operation again.", exit_code=20) from None
    except OSError:
        raise CanvasCliError("Jimeng Canvas CLI could not be started.") from None
    if completed.returncode != 0:
        for output in (completed.stderr, completed.stdout):
            try:
                failure = json.loads(output)
            except (ValueError, TypeError):
                continue
            error = failure.get("error") if isinstance(failure, dict) else None
            if isinstance(error, dict) and error.get("code") == 10000:
                raise CanvasCliError("Jimeng Canvas denied access to the selected model or settings. Check your membership and model access.", exit_code=12)
        messages = {
            10: "Jimeng Canvas requires approval before continuing.",
            11: "Sign in to Jimeng Canvas to continue.",
            12: "Jimeng Canvas denied access to the selected model or settings. Check your membership and model access.",
            20: "Jimeng Canvas CLI is still waiting. Check the recorded operation again.",
        }
        raise CanvasCliError(messages.get(completed.returncode, "Jimeng Canvas CLI command failed."), exit_code=completed.returncode)
    try:
        envelope = json.loads(completed.stdout)
    except (ValueError, TypeError):
        raise CanvasCliError("Jimeng Canvas CLI returned invalid JSON.") from None
    if not isinstance(envelope, dict) or envelope.get("ok") is not True or not isinstance(envelope.get("data"), dict):
        raise CanvasCliError("Jimeng Canvas CLI returned an invalid response.")
    return envelope["data"]


def get_canvas_setup_status() -> dict[str, object]:
    try:
        _resolve_executable()
    except CanvasCliError as exc:
        return {"cliAvailable": False, "authenticated": False, "message": str(exc)}
    result: dict[str, object] = {"cliAvailable": True, "authenticated": False}
    try:
        version = run_canvas(["version"])
        value = version.get("version")
        if isinstance(value, str) and re.fullmatch(r"[0-9]+\.[0-9]+\.[0-9]+(?:[-+][A-Za-z0-9.-]+)?", value):
            result["version"] = value
        auth = run_canvas(["auth", "status"])
        result["authenticated"] = auth.get("loggedIn") is True
        if not result["authenticated"]:
            result["message"] = "Sign in to Jimeng Canvas to continue."
    except CanvasCliError as exc:
        result["message"] = str(exc)
    return result


def install_canvas_cli() -> dict[str, object]:
    root = _root_dir()
    override = os.environ.get("JIMENG_CANVAS_CLI_PATH", "").strip()
    if override:
        resolved = shutil.which(override, path=_environment()["PATH"])
        if not resolved or Path(resolved).resolve() != (root / "bin/dreamina-canvas").resolve():
            raise CanvasCliError("Update the configured JIMENG_CANVAS_CLI_PATH executable directly, or unset the override before installing.")
    root.mkdir(parents=True, exist_ok=True)
    for directory in (root / "bin", root / "skills", _state_dir()):
        directory.mkdir(parents=True, exist_ok=True, mode=0o700)
    try:
        response = urlopen(Request(CANVAS_INSTALL_URL, headers={"User-Agent": "Canva Banana Canvas Setup/0.1"}), timeout=60)
        try:
            installer = response.read()
        finally:
            response.close()
    except HTTPError as exc:
        raise CanvasCliError(f"Jimeng Canvas installer download failed with HTTP {exc.code}.") from None
    except (URLError, OSError):
        raise CanvasCliError("Jimeng Canvas installer download failed.") from None
    try:
        completed = subprocess.run(
            ["bash"], input=installer, cwd=root, env=_environment(),
            capture_output=True, timeout=300, check=False,
        )
    except (OSError, subprocess.TimeoutExpired):
        raise CanvasCliError("Jimeng Canvas installation did not complete.") from None
    if completed.returncode != 0:
        raise CanvasCliError("Jimeng Canvas installation failed.", exit_code=completed.returncode)
    return {"status": "ok", "message": "Jimeng Canvas CLI installation completed.", **get_canvas_setup_status()}


def _prune_sessions() -> None:
    now = time.time()
    for session_id, session in list(_LOGIN_SESSIONS.items()):
        if session.expires_at <= now:
            del _LOGIN_SESSIONS[session_id]


def _is_authenticated(data: dict[str, object]) -> bool:
    state = data.get("state")
    return data.get("loggedIn") is True or isinstance(state, dict) and state.get("loggedIn") is True


def _safe_verification_uri(value: object) -> str:
    if not isinstance(value, str):
        raise CanvasCliError("Jimeng Canvas did not return a login address.")
    try:
        parsed = urlsplit(value)
        allowed = parsed.hostname in {"jimeng.jianying.com", "dreamina.capcut.com"}
        allowed = allowed or bool(parsed.hostname and parsed.hostname.endswith(".jianying.com"))
        secret_query = any(key.replace("_", "").lower() in _SECRET_KEYS for key, _ in parse_qsl(parsed.query))
        valid = parsed.scheme == "https" and allowed and not parsed.username and not parsed.password and parsed.port in (None, 443) and not secret_query and not parsed.fragment
    except ValueError:
        valid = False
    if not valid:
        raise CanvasCliError("Jimeng Canvas returned an unsupported login address.")
    return value


def start_canvas_login() -> dict[str, object]:
    with _START_LOGIN_LOCK:
        with _SESSIONS_LOCK:
            _prune_sessions()
            for session in _LOGIN_SESSIONS.values():
                if session.state_dir == _session_scope():
                    return dict(session.authorization)
        data = run_canvas(["auth", "login", "--no-browser"])
        if _is_authenticated(data):
            return {"cliAvailable": True, "authenticated": True}
        challenge = data.get("challenge")
        if not isinstance(challenge, dict):
            raise CanvasCliError("Jimeng Canvas did not return a login challenge.")
        device_code, user_code = challenge.get("deviceCode"), challenge.get("userCode")
        if not isinstance(device_code, str) or not device_code or not isinstance(user_code, str) or not user_code:
            raise CanvasCliError("Jimeng Canvas returned an invalid login challenge.")
        authorization: dict[str, object] = {
            "loginSessionId": uuid4().hex,
            "verificationUri": _safe_verification_uri(challenge.get("verificationUri")),
            "userCode": user_code,
            "cliAvailable": True,
            "authenticated": False,
        }
        expires_at = time.time() + _LOGIN_TTL_SECONDS
        if isinstance(challenge.get("expiresAt"), str):
            try:
                expires_at = min(expires_at, datetime.fromisoformat(challenge["expiresAt"].replace("Z", "+00:00")).timestamp())
            except ValueError:
                raise CanvasCliError("Jimeng Canvas returned an invalid login expiry.") from None
            authorization["expiresAt"] = challenge["expiresAt"]
        with _SESSIONS_LOCK:
            _LOGIN_SESSIONS[str(authorization["loginSessionId"])] = _LoginSession(device_code, expires_at, _session_scope(), authorization)
        return dict(authorization)


def check_canvas_login(login_session_id: str, *, poll_seconds: int = 30) -> dict[str, object]:
    with _SESSIONS_LOCK:
        _prune_sessions()
        session = _LOGIN_SESSIONS.get(login_session_id)
    if session is None or session.state_dir != _session_scope():
        raise CanvasCliError("This Jimeng Canvas login session expired. Start sign-in again.", exit_code=11)
    with session.lock:
        seconds = max(1, min(60, poll_seconds))
        try:
            data = run_canvas(["auth", "wait", "--device-code", session.device_code, "--timeout", f"{seconds}s"], timeout_seconds=seconds + 10)
        except CanvasCliError as exc:
            if exc.exit_code == 20:
                return {"cliAvailable": True, "authenticated": False, "pending": True}
            if exc.exit_code == 11:
                with _SESSIONS_LOCK:
                    _LOGIN_SESSIONS.pop(login_session_id, None)
            raise
        if _is_authenticated(data):
            with _SESSIONS_LOCK:
                _LOGIN_SESSIONS.pop(login_session_id, None)
            return {"cliAvailable": True, "authenticated": True}
        return {"cliAvailable": True, "authenticated": False, "pending": True}


def get_canvas_account_scope() -> str:
    account = run_canvas(["auth", "account"])
    user_id = account.get("userId")
    if isinstance(user_id, bool) or not isinstance(user_id, (str, int)) or not str(user_id).strip():
        raise CanvasCliError("Jimeng Canvas did not identify the authenticated account.", exit_code=11)
    space = run_canvas(["space", "current"])
    kind = space.get("kind")
    team = space.get("team")
    team_id = team.get("teamId") if isinstance(team, dict) else None
    if not isinstance(kind, str) or kind not in {"personal", "team"} or kind == "team" and (not isinstance(team_id, str) or not team_id):
        raise CanvasCliError("Jimeng Canvas did not identify the current account space.")
    identity = json.dumps([str(_state_dir().resolve()), _profile(), str(user_id), kind, team_id], separators=(",", ":"))
    return hashlib.sha256(identity.encode()).hexdigest()


_FLAG_FIELDS = {"flag", "required", "values", "min", "max", "step", "minLength", "maxLength"}
_MODE_FIELDS = {"scenario", "name", "vipRequired", "vipResolutions"}
_REFERENCE_FIELDS = {"min", "max", "requireAnyOfTypes", "mutuallyExclusiveTypes"}
_ITEM_FIELDS = {"type", "model", "displayName", "aliases"}
_SECRET_KEYS = {"token", "accesstoken", "refreshtoken", "devicecode", "authorization", "cookie", "secret", "password"}


def _clean_value(value: object) -> object:
    if isinstance(value, dict):
        return {key: _clean_value(item) for key, item in value.items() if isinstance(key, str) and key.replace("_", "").lower() not in _SECRET_KEYS}
    if isinstance(value, list):
        return [_clean_value(item) for item in value]
    if isinstance(value, float) and not math.isfinite(value):
        raise CanvasCliError("Jimeng Canvas returned an invalid model catalog.")
    return value


def _pick(value: dict[str, object], keys: set[str]) -> dict[str, object]:
    return {key: _clean_value(item) for key, item in value.items() if key in keys}


def get_canvas_catalog(kind: Literal["image", "video"]) -> dict[str, object]:
    if kind not in {"image", "video"}:
        raise CanvasCliError("Unsupported Jimeng Canvas catalog type.", exit_code=2)
    data = run_canvas(["model", "ls", "--refresh", "--type", kind])
    raw_items = data.get("items")
    if not isinstance(raw_items, list):
        raise CanvasCliError("Jimeng Canvas returned an invalid model catalog.")
    items: list[dict[str, object]] = []
    for raw_item in raw_items:
        if not isinstance(raw_item, dict) or raw_item.get("type") != kind or not isinstance(raw_item.get("model"), str):
            continue
        modes: list[dict[str, object]] = []
        raw_modes = raw_item.get("modes", [])
        if not isinstance(raw_modes, list):
            continue
        for raw_mode in raw_modes:
            if not isinstance(raw_mode, dict) or not isinstance(raw_mode.get("name"), str):
                continue
            mode = _pick(raw_mode, _MODE_FIELDS)
            flags = raw_mode.get("flags", [])
            if isinstance(flags, list):
                mode["flags"] = [_pick(flag, _FLAG_FIELDS) for flag in flags if isinstance(flag, dict) and isinstance(flag.get("flag"), str)]
            references = raw_mode.get("references")
            if isinstance(references, dict):
                cleaned = _pick(references, _REFERENCE_FIELDS)
                media_types = references.get("types", [])
                if isinstance(media_types, list):
                    cleaned["types"] = [_pick(media, {"mediaType", "min", "max"}) for media in media_types if isinstance(media, dict)]
                mode["references"] = cleaned
            combinations = raw_mode.get("forbiddenParamCombinations")
            if isinstance(combinations, list):
                mode["forbiddenParamCombinations"] = _clean_value(combinations)
            modes.append(mode)
        items.append({**_pick(raw_item, _ITEM_FIELDS), "modes": modes})
    return {"items": items}
