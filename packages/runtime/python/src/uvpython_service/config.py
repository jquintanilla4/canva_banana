from __future__ import annotations

import os
from dataclasses import dataclass, replace
from functools import lru_cache
from pathlib import Path

from dotenv import dotenv_values, load_dotenv


_TOKENHUB_DEFAULT_BASE_URL = "https://tokenhub.ctclouds.com/v1"
_DEFAULT_TOS_BUCKET = "seedance-assets"
_DEFAULT_TOS_REGION = "cn-beijing"
_TOKENHUB_DEV_KEYS = ("TOKENHUB_API_KEY", "TOKENHUB_BASE_URL", "VOLCENGINE_ACCESS_KEY", "VOLCENGINE_SECRET_KEY", "TOS_BUCKET_NAME", "TOS_REGION")
_tokenhub_shell_settings = {key: os.environ[key] for key in _TOKENHUB_DEV_KEYS if key in os.environ}


def _read_int(name: str, default: int) -> int:
    try:
        return int(os.environ.get(name, ""))
    except ValueError:
        return default


def _find_backend_dir() -> Path:
    cwd = Path.cwd()  # Use the launched process location as the first hint.
    for candidate in (cwd, *cwd.parents):
        backend_dir = candidate / "backend"  # Repo-root runs should find the backend folder here.
        if (backend_dir / "src" / "uvpython_service").exists():
            return backend_dir
        if (candidate / "src" / "uvpython_service").exists():
            return candidate  # Backend-root runs should resolve directly.
    return cwd  # Fall back to cwd so env overrides are not required in tests.


def _load_env_files() -> None:
    packaged_env_dir = os.environ.get("CANVA_BANANA_ENV_DIR", "").strip()
    if packaged_env_dir:
        load_dotenv(dotenv_path=Path(packaged_env_dir).expanduser() / ".env.local", override=False)  # Packaged app reads user app data only.
        load_dotenv(dotenv_path=Path(packaged_env_dir).expanduser() / ".env", override=False)
        return
    # Library consumers supply environment values or CANVA_BANANA_ENV_DIR explicitly.


_load_env_files()


@dataclass(frozen=True)
class Settings:
    ark_api_key: str
    volcengine_access_key: str
    volcengine_secret_key: str
    tos_bucket_name: str
    tos_region: str
    poll_interval_seconds: int
    job_ttl_seconds: int
    max_terminal_jobs: int
    max_logs_per_job: int
    jimeng_canvas_root_dir: Path
    tokenhub_api_key: str = ""
    tokenhub_base_url: str = _TOKENHUB_DEFAULT_BASE_URL
    tokenhub_poll_interval_seconds: int = 5
    tokenhub_timeout_seconds: int = 900


def get_legacy_jimeng_work_dir() -> Path:
    configured = os.environ.get("JIMENG_WORK_DIR")
    return Path(configured).expanduser() if configured is not None else _find_backend_dir() / ".jimeng-work"


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    canvas_root_dir = os.environ.get("JIMENG_CANVAS_ROOT_DIR", "").strip()
    return Settings(
        tokenhub_api_key=os.environ.get("TOKENHUB_API_KEY", "").strip(),
        tokenhub_base_url=os.environ.get("TOKENHUB_BASE_URL", "").strip() or _TOKENHUB_DEFAULT_BASE_URL,
        tokenhub_poll_interval_seconds=min(10, max(5, _read_int("TOKENHUB_POLL_INTERVAL_SECONDS", 5))),
        tokenhub_timeout_seconds=max(1, _read_int("TOKENHUB_TIMEOUT_SECONDS", 900)),
        ark_api_key=os.environ.get("ARK_API_KEY", "").strip(),  # Ark API credential.
        volcengine_access_key=os.environ.get("VOLCENGINE_ACCESS_KEY", "").strip(),  # TOS access key.
        volcengine_secret_key=os.environ.get("VOLCENGINE_SECRET_KEY", "").strip(),  # TOS secret key.
        tos_bucket_name=os.environ.get("TOS_BUCKET_NAME", "").strip() or _DEFAULT_TOS_BUCKET,
        tos_region=os.environ.get("TOS_REGION", "").strip() or _DEFAULT_TOS_REGION,
        poll_interval_seconds=max(2, int(os.environ.get("VOLCENGINE_POLL_INTERVAL_SECONDS", "15"))),  # Backend poll cadence defaults to 15 seconds.
        job_ttl_seconds=max(300, int(os.environ.get("VOLCENGINE_JOB_TTL_SECONDS", "14400"))),  # Drop old finished jobs after 4 hours by default.
        max_terminal_jobs=max(10, int(os.environ.get("VOLCENGINE_MAX_TERMINAL_JOBS", "400"))),  # Keep extra completed jobs around without growing forever.
        max_logs_per_job=max(10, int(os.environ.get("VOLCENGINE_MAX_LOGS_PER_JOB", "100"))),  # Preserve more queue history while still capping memory growth.
        jimeng_canvas_root_dir=Path(canvas_root_dir).expanduser() if canvas_root_dir else get_legacy_jimeng_work_dir().parent / ".jimeng-canvas",
    )


def get_tokenhub_settings(settings: Settings) -> Settings:
    env_dir = os.environ.get("CANVA_BANANA_ENV_DIR", "").strip()
    if not env_dir or os.environ.get("CANVA_BANANA_DEV_TOKENHUB_ENV") != "1":
        return settings
    root = Path(env_dir).expanduser()
    values = {
        **dotenv_values(root / ".env", interpolate=False),
        **dotenv_values(root / ".env.local", interpolate=False),
        **_tokenhub_shell_settings,
    }
    return replace(
        settings,
        tokenhub_api_key=(values.get("TOKENHUB_API_KEY") or "").strip(),
        tokenhub_base_url=(values.get("TOKENHUB_BASE_URL") or "").strip() or _TOKENHUB_DEFAULT_BASE_URL,
        volcengine_access_key=(values.get("VOLCENGINE_ACCESS_KEY") or "").strip(),
        volcengine_secret_key=(values.get("VOLCENGINE_SECRET_KEY") or "").strip(),
        tos_bucket_name=(values.get("TOS_BUCKET_NAME") or "").strip() or _DEFAULT_TOS_BUCKET,
        tos_region=(values.get("TOS_REGION") or "").strip() or _DEFAULT_TOS_REGION,
    )
