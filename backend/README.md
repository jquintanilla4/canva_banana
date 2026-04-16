# Volcengine Service

Local FastAPI service that runs Seedance 2 generations for Canva Banana.

## Setup

```bash
uv sync --project backend
```

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
