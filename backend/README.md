# Volcengine Service

Local FastAPI service that runs Seedance 2 generations for Canva Banana.

## Setup

```bash
uv sync --project backend
```

`uv sync --project backend` now installs a bundled `ffprobe` fallback for Seedance reference audio/video validation. If you already set up the backend before this change, rerun the same command after pulling the latest repo changes.

## Run

```bash
uv run --project backend uvicorn volcengine_service.main:app --app-dir backend/src --reload --host 0.0.0.0 --port 8000
```

## Required env

- `ARK_API_KEY`
- `VOLCENGINE_ACCESS_KEY`
- `VOLCENGINE_SECRET_KEY`

## Optional env

- `TOS_BUCKET_NAME`
- `TOS_REGION`
- `VOLCENGINE_POLL_INTERVAL_SECONDS`
- `VOLCENGINE_JOB_TTL_SECONDS`
- `VOLCENGINE_MAX_TERMINAL_JOBS`
- `VOLCENGINE_MAX_LOGS_PER_JOB`
- `VOLCENGINE_FFPROBE_PATH`

## ffprobe Checks

- The backend checks for `ffprobe` in this order: `VOLCENGINE_FFPROBE_PATH`, system `PATH`, then the bundled binary installed by `uv sync --project backend`.
- If `ffprobe` is still unavailable, `/health` reports the degraded state and Seedance reference uploads fall back to frontend/provider duration validation instead of failing at submission time.
