from __future__ import annotations

import os
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

from dotenv import load_dotenv


def _find_env_path(file_name: str) -> Path:
    cwd = Path.cwd()  # Start from the current working directory.
    for candidate in (cwd, *cwd.parents):
        env_path = candidate / file_name  # Search upward so repo-root env files still load from backend commands.
        if env_path.exists():
            return env_path
    return cwd / file_name  # Fall back to the local cwd path.


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
        return
    load_dotenv(dotenv_path=_find_env_path(".env.local"), override=False)  # Local overrides should win when shell env is absent.
    load_dotenv(dotenv_path=_find_env_path(".env"), override=False)  # Shared defaults fill any keys missing from .env.local.


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
    jimeng_cli_path: str
    jimeng_work_dir: Path
    jimeng_submit_poll_seconds: int
    jimeng_submit_timeout_seconds: int
    jimeng_result_timeout_seconds: int
    jimeng_query_interval_seconds: int


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    backend_dir = _find_backend_dir()  # Keep Jimeng generated assets inside the backend folder by default.
    return Settings(
        ark_api_key=os.environ.get("ARK_API_KEY", "").strip(),  # Ark API credential.
        volcengine_access_key=os.environ.get("VOLCENGINE_ACCESS_KEY", "").strip(),  # TOS access key.
        volcengine_secret_key=os.environ.get("VOLCENGINE_SECRET_KEY", "").strip(),  # TOS secret key.
        tos_bucket_name=os.environ.get("TOS_BUCKET_NAME", "seedance-assets").strip() or "seedance-assets",  # Public asset bucket.
        tos_region=os.environ.get("TOS_REGION", "cn-beijing").strip() or "cn-beijing",  # Bucket region.
        poll_interval_seconds=max(2, int(os.environ.get("VOLCENGINE_POLL_INTERVAL_SECONDS", "15"))),  # Backend poll cadence defaults to 15 seconds.
        job_ttl_seconds=max(300, int(os.environ.get("VOLCENGINE_JOB_TTL_SECONDS", "14400"))),  # Drop old finished jobs after 4 hours by default.
        max_terminal_jobs=max(10, int(os.environ.get("VOLCENGINE_MAX_TERMINAL_JOBS", "400"))),  # Keep extra completed jobs around without growing forever.
        max_logs_per_job=max(10, int(os.environ.get("VOLCENGINE_MAX_LOGS_PER_JOB", "100"))),  # Preserve more queue history while still capping memory growth.
        jimeng_cli_path=os.environ.get("JIMENG_CLI_PATH", "").strip(),  # Optional explicit dreamina executable.
        jimeng_work_dir=Path(os.environ.get("JIMENG_WORK_DIR", str(backend_dir / ".jimeng-work"))).expanduser(),  # Staged Jimeng files live outside tracked source.
        jimeng_submit_poll_seconds=max(1, int(os.environ.get("JIMENG_SUBMIT_POLL_SECONDS", "30"))),  # CLI waits this long on initial submit.
        jimeng_submit_timeout_seconds=max(30, int(os.environ.get("JIMENG_SUBMIT_TIMEOUT_SECONDS", "300"))),  # Base command timeout excludes the size-based upload allowance.
        jimeng_result_timeout_seconds=max(30, int(os.environ.get("JIMENG_RESULT_TIMEOUT_SECONDS", "900"))),  # Backend waits up to 15 minutes by default.
        jimeng_query_interval_seconds=max(1, int(os.environ.get("JIMENG_QUERY_INTERVAL_SECONDS", "10"))),  # Delay between query_result checks.
    )
