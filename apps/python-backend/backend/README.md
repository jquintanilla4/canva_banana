# UV Python Service

Local FastAPI backend that runs Seedance 2 generations for Canva Banana. It supports Volcengine Ark directly and Jimeng through the `dreamina` CLI.

## Setup

```bash
npm -w @canva-banana/python-backend run sync
```

`npm -w @canva-banana/python-backend run sync` now installs a bundled `ffprobe` fallback for Seedance reference audio/video validation. If you already set up the backend before this change, rerun the same command after pulling the latest repo changes.

## Run

```bash
npm run backend:dev
```

## Volcengine env

- `ARK_API_KEY`
- `VOLCENGINE_ACCESS_KEY`
- `VOLCENGINE_SECRET_KEY`

These are required for the direct Volcengine Seedance 2 provider path. Jimeng CLI jobs do not need these credentials.

The backend reads repo-root `.env.local` first and falls back to `.env`, while still letting exported shell variables win. 

## Optional env

- `TOS_BUCKET_NAME`
- `TOS_REGION`
- `VOLCENGINE_POLL_INTERVAL_SECONDS` (default: `15`)
- `VOLCENGINE_JOB_TTL_SECONDS`
- `VOLCENGINE_MAX_TERMINAL_JOBS`
- `VOLCENGINE_MAX_LOGS_PER_JOB`
- `VOLCENGINE_FFPROBE_PATH`
- `JIMENG_CLI_PATH` (optional path to the `dreamina` executable)
- `JIMENG_WORK_DIR` (default: `apps/python-backend/backend/.jimeng-work`)
- `JIMENG_SUBMIT_POLL_SECONDS` (default: `30`)
- `JIMENG_RESULT_TIMEOUT_SECONDS` (default: `900`)
- `JIMENG_QUERY_INTERVAL_SECONDS` (default: `10`)

## Jimeng CLI

The app can handle Jimeng setup from the UI. Start the backend and frontend, select `Seedance 2 (JM CLI)`, then use the setup panel to install/update the CLI, start login, and recheck account status.

Manual fallback: install or update the CLI with the official command:

```bash
curl -fsSL https://jimeng.jianying.com/cli | bash
```

Then log in and verify the account:

```bash
dreamina login
dreamina user_credit
```

Use `dreamina login --debug` if browser login stalls. The CLI stores config and logs under `~/.dreamina_cli/`, including `~/.dreamina_cli/logs/` for troubleshooting.

## ffprobe Checks

- The backend checks for `ffprobe` in this order: `VOLCENGINE_FFPROBE_PATH`, system `PATH`, then the bundled binary installed by `npm -w @canva-banana/python-backend run sync`.
- If `ffprobe` is still unavailable, `/health` reports the degraded state and Seedance reference uploads fall back to frontend/provider duration validation instead of failing at submission time.
