from __future__ import annotations

import os
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

from dotenv import load_dotenv


def _find_env_path() -> Path:
    cwd = Path.cwd()  # Start from the current working directory.
    for candidate in (cwd, *cwd.parents):
        env_path = candidate / ".env"  # Prefer the repo-level env file.
        if env_path.exists():
            return env_path
    return cwd / ".env"  # Fall back to the local cwd path.


load_dotenv(dotenv_path=_find_env_path(), override=False)  # Respect existing shell env values.


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


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings(
        ark_api_key=os.environ.get("ARK_API_KEY", "").strip(),  # Ark API credential.
        volcengine_access_key=os.environ.get("VOLCENGINE_ACCESS_KEY", "").strip(),  # TOS access key.
        volcengine_secret_key=os.environ.get("VOLCENGINE_SECRET_KEY", "").strip(),  # TOS secret key.
        tos_bucket_name=os.environ.get("TOS_BUCKET_NAME", "seedance-assets").strip() or "seedance-assets",  # Public asset bucket.
        tos_region=os.environ.get("TOS_REGION", "cn-beijing").strip() or "cn-beijing",  # Bucket region.
        poll_interval_seconds=max(2, int(os.environ.get("VOLCENGINE_POLL_INTERVAL_SECONDS", "5"))),  # Backend poll cadence.
        job_ttl_seconds=max(300, int(os.environ.get("VOLCENGINE_JOB_TTL_SECONDS", "14400"))),  # Drop old finished jobs after 4 hours by default.
        max_terminal_jobs=max(10, int(os.environ.get("VOLCENGINE_MAX_TERMINAL_JOBS", "400"))),  # Keep extra completed jobs around without growing forever.
        max_logs_per_job=max(10, int(os.environ.get("VOLCENGINE_MAX_LOGS_PER_JOB", "100"))),  # Preserve more queue history while still capping memory growth.
    )
