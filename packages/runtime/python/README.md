# UV Python Service

Local FastAPI backend that runs Seedance generations for Canva Banana. It supports Volcengine Ark directly, TokenHub, and Jimeng video and Seedream images through `dreamina-canvas`.

## Setup and run

Inside the Canva Banana repository, use its existing app wrapper:

```bash
npm -w @canva-banana/python-backend run sync
npm run backend:dev
```

Inside an installed `@canva-banana/runtime` package, use the directory returned by `pythonBackendSourcePath` as `<python-project>`:

```bash
uv sync --project <python-project>
uv run --project <python-project> uvicorn uvpython_service.main:app --app-dir <python-project>/src --host 127.0.0.1 --port 8000
```

Both setup paths install the bundled `ffprobe` fallback for reference audio/video validation. Re-run setup when the runtime dependency lock changes. The host owns process startup, shutdown, environment values and service access.

## Volcengine env

- `ARK_API_KEY`
- `VOLCENGINE_ACCESS_KEY`
- `VOLCENGINE_SECRET_KEY`

These are required for the direct Volcengine Seedance 2 provider path. Jimeng Canvas jobs do not need these credentials.

The service only loads environment files when `CANVA_BANANA_ENV_DIR` explicitly names their directory. It reads `.env.local` then `.env`, while exported shell values take precedence. The repository app wrapper sets this directory to the repository root for development; installed consumers must supply it or pass environment values directly.

## TokenHub Seedance

Set `TOKENHUB_API_KEY` on the Python service. `TOKENHUB_BASE_URL` defaults to `https://tokenhub.ctclouds.com/v1`. Select **Seedance 2/2.5 (TokenHub)** in the video model picker, then select **Seedance 2.0** or **Seedance 2.5** in the **Model** control.

For uploaded frames and references, set `VOLCENGINE_ACCESS_KEY`, `VOLCENGINE_SECRET_KEY`, `TOS_BUCKET_NAME`, and `TOS_REGION` for your TOS bucket. The service gives TokenHub expiring URLs to read those files. Text-only generation requires the TokenHub key alone.

TokenHub stages uploads under `tokenhub_seedance_refs/`. Configure a bucket lifecycle rule for this prefix to delete temporary objects after your chosen retention period.

Desktop and standalone browser builds enable the picker when they have a TokenHub key in their configuration. For a separate browser build and Python environment, set `TOKENHUB_VIDEO_ENABLED=true` in the browser build and keep the key in Python. Embedded hosts can set `tokenHubSeedanceEnabled` in the workspace runtime config.

## Optional env

- `TOS_BUCKET_NAME`
- `TOS_REGION`
- `VOLCENGINE_POLL_INTERVAL_SECONDS` (default: `15`)
- `VOLCENGINE_JOB_TTL_SECONDS`
- `VOLCENGINE_MAX_TERMINAL_JOBS`
- `VOLCENGINE_MAX_LOGS_PER_JOB`
- `VOLCENGINE_FFPROBE_PATH`
- `JIMENG_CANVAS_CLI_PATH` to use a manually installed `dreamina-canvas` executable
- `JIMENG_CANVAS_ROOT_DIR` for the Canvas installation and default working data, otherwise `.jimeng-canvas` under the backend project directory
- `JIMENG_CANVAS_WORK_DIR` for persisted jobs and staged media, otherwise the Canvas root
- `DREAMINA_CANVAS_STATE_DIR` for account state, otherwise `state/` under the Canvas root
- `JIMENG_CANVAS_PROFILE` for the Canvas profile name, otherwise `canva-banana`

## Jimeng Canvas

Start the backend and frontend, then open **Jimeng Canvas Setup** in the app. Install or update the CLI, sign in, and refresh the model catalog. The setup panel uses `dreamina-canvas auth login --no-browser`. Open the displayed authorization page, enter the short code, and choose **Check Login**. The backend keeps the sensitive device code in memory until the login session expires and never returns it to the browser.

Video generation and Seedream image generation use the Canvas account and its model catalog. Standard and Fast choices appear when the catalog provides those channels. Saved Multi-frame selections remain readable as metadata, but cannot start a new generation.

For a manual installation, use the official installer:

```bash
curl -fsSL https://jimeng.jianying.com/canvas-cli/install.sh | bash
```

If the executable is outside the service's `PATH`, set `JIMENG_CANVAS_CLI_PATH` to its full path. Update a manually configured executable yourself, or clear the override to let setup manage the installation. Canvas installation and login are separate from other Dreamina tools.

Packaged desktop launches store the Canvas installation, persisted jobs, and account state under `.jimeng-canvas` in the app's user data directory. An existing Canvas data location is preserved during upgrades. Explicit Canvas path settings take precedence. Installed runtime hosts must choose writable directories and keep them across process restarts so account login and submitted jobs remain recoverable.

When reporting a failure, include the Canvas CLI version, error, local job ID when available, and relevant logs without sensitive account material.

## ffprobe Checks

- The backend checks for `ffprobe` in this order: `VOLCENGINE_FFPROBE_PATH`, system `PATH`, then the bundled binary installed by either setup path above.
- If `ffprobe` is still unavailable, `/health` reports the degraded state and Seedance reference uploads fall back to frontend/provider duration validation instead of failing at submission time.
