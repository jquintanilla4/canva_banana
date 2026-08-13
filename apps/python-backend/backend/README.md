# UV Python Service

Local FastAPI backend that runs Seedance generations for Canva Banana. It supports Volcengine Ark directly and Jimeng through the `dreamina` CLI.

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
- `JIMENG_SUBMIT_TIMEOUT_SECONDS` (default: `300`; a size-based upload allowance is added automatically)
- `JIMENG_RESULT_TIMEOUT_SECONDS` (default: `900`)
- `JIMENG_QUERY_INTERVAL_SECONDS` (default: `10`)

## Jimeng CLI

The app can handle Jimeng setup from the UI. Start the backend and frontend, select a Jimeng model, then use the setup panel to install/update the CLI, start login, and recheck account status. The integration requires Dreamina CLI 1.4.15 or newer.

Manual fallback: install or update the CLI with the official command:

```bash
curl -fsSL https://jimeng.jianying.com/cli | bash
```

Then log in and verify the account:

```bash
dreamina login
dreamina user_credit
```

The in-app login uses the non-blocking OAuth Device Flow equivalents `dreamina login --headless` and `dreamina login checklogin`. Open the displayed verification URL, enter the short user code, then click **Check Login**. The backend keeps the sensitive device code in memory for at most 15 minutes and does not return it to the browser.

Supported Jimeng video paths:

- `Seedance 2 (JM CLI)`: regular, fast, VIP, fast VIP, and mini channels; 720p by default, with 1080p and 4K only on `seedance2.0_vip`.
- `Seedance 2.5 (JM CLI)`: 480p or 720p, 4–30 seconds, larger multimodal limits, and audio-only reference input.
- Smart mode with a first and last still image routes to `frames2video`.
- `Jimeng Multi-frame`: select 2–20 still images. With two images, enter one prompt. With three or more, enter one transition prompt per segment separated by `||`; output can be 720p or 1080p.
- The setup panel's Dreamina session field sends `--session` with every generation command; `0` uses the default session.

Video generation may require a first generation with the selected model on the Dreamina website. If the CLI returns `AigcComplianceConfirmationRequired`, complete that web generation and retry. The CLI stores config and logs under `~/.dreamina_cli/`, including `~/.dreamina_cli/logs/` for troubleshooting. When reporting a failure, include the exact command, CLI version, error, submit ID when available, and the relevant log excerpt without exposing sensitive login material.

## ffprobe Checks

- The backend checks for `ffprobe` in this order: `VOLCENGINE_FFPROBE_PATH`, system `PATH`, then the bundled binary installed by `npm -w @canva-banana/python-backend run sync`.
- If `ffprobe` is still unavailable, `/health` reports the degraded state and Seedance reference uploads fall back to frontend/provider duration validation instead of failing at submission time.
