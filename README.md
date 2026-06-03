# Canva Banana
_Work in progress, expect bugs_

Infinite canvas for AI image/video generation and editing with Fal.ai + Google Gemini.

## Features

- **Multi-provider AI generation** - Text-to-image, image edit, upscales, and video models across Fal.ai and Google
- **Infinite canvas** - Images, videos, and audio in a single scrollable workspace (drag/drop or upload)
- **Canvas + Annotate modes**:
  - Selection and free-select tools
  - Notes with adjustable colors and font sizes
  - Brush/eraser with independent size controls
  - Hand tool for navigation
- **Media tools**:
  - Crop, transform (hold Shift for free/non-uniform), resize, duplicate
  - Layer reordering, background removal, and video frame capture
  - Play/pause for audio/video and waveform previews
- **Project management**:
  - Snapshot import/export (`.bcsnap`)
  - Autosave backups with restore after snapshot export
  - Snapshot-based session restore
- **Observability + experiments**:
  - Fal queue panel with job status
  - Metadata overlays, debug log panel
  - Blind test mode and open-source alias mode

## Run Locally

**Prerequisites:** Node.js/npm, `uv`, and `make`

### Setup Steps

1. **Install dependencies** (⚠️ Required - don't skip this!):
   ```bash
   npm install
   ```

2. **Set up environment variables:**
   - Set `GEMINI_API_KEY` in [.env.local](.env.local) for Google Gemini.
   - Set `FAL_API_KEY` in [.env.local](.env.local) for the secure Node backend's Fal.ai proxy.
   - Set `MOONSHOT_API_KEY` in [.env.local](.env.local) for the secure Node backend's Kimi K2.6 intent parsing.
   - Set `ARK_API_KEY`, `VOLCENGINE_ACCESS_KEY`, and `VOLCENGINE_SECRET_KEY` in [.env.local](.env.local) for Volcengine Seedance 2.
   - For `Seedance 2 (JM CLI)`, start the UV Python service and complete Jimeng CLI setup from the in-app panel.
   - Optional: `SECURE_BACKEND_API_BASE_URL` to point the frontend at a different Node backend.
   - Optional: `SECURE_BACKEND_ALLOWED_ORIGINS` to comma-separate trusted browser origins for the Node backend.
   - Optional: `NODE_BACKEND_HOST` and `NODE_BACKEND_PORT` to override the Node backend bind address.
   - Optional: `FAL_API_URL` to point the Fal SDK at a different proxy endpoint.
   - Optional: `FAL_MODEL_ID` to override the default Fal image model.
   
   Fal and Moonshot keys are only read by the Node backend. They are not injected into the Vite browser bundle.

3. **Sync the UV Python backend dependencies:**
   ```bash
   uv sync --project backend
   ```

4. **Start all local services:**
   ```bash
   make dev
   ```

   This starts:
   - The Vite dev server on `http://localhost:3000`
   - The secure Node backend on `http://localhost:8787`
   - The UV Python backend for Volcengine and Jimeng on `http://localhost:8000`

   If you only need one side of the app, these fallback commands still work:
   ```bash
   make frontend-dev
   make secure-backend-dev
   make backend-dev
   ```

### Secure Node Backend

Fal.ai and Moonshot calls use the local Node backend so API keys stay out of browser-side JavaScript.

```bash
npm run secure-backend:dev
```

- `FAL_API_KEY` is used server-side for the Fal SDK proxy and Fal asset downloads.
- `MOONSHOT_API_KEY` is used server-side for HeyGen prompt timing intent extraction with `kimi-k2.6`.
- The backend listens on `127.0.0.1:8787` by default and only allows `http://localhost:3000` or `http://127.0.0.1:3000` browser origins.
- The backend reads repo-root `.env.local` first and falls back to `.env`, while exported shell variables still win.

### Seedance 2 Backend

Seedance 2 uses the local FastAPI backend in [backend/README.md](backend/README.md).

```bash
uv sync --project backend
uv run --project backend uvicorn uvpython_service.main:app --app-dir backend/src --reload --host 0.0.0.0 --port 8000
```

- `uv sync --project backend` installs a bundled `ffprobe` fallback for reference audio/video validation.
- The backend now reads `.env.local` first and falls back to `.env`, so the same repo-root env file works for Vite and FastAPI.
- If you already onboarded before this dependency was added, rerun `uv sync --project backend` after pulling the latest changes.
- You can override the binary location with `VOLCENGINE_FFPROBE_PATH` if your machine already has a preferred `ffprobe` install.

### Other Commands

```bash
npm run build
npm run preview
npm run typecheck
npm run test -- --run
```

### Troubleshooting

**Error: `sh: vite: command not found`**
- This means dependencies weren't installed. Run `npm install` first before running `npm run dev`.

## Usage

### Keyboard Shortcuts

#### Zoom Controls
- `+` or `=` - Zoom in
- `-` or `_` - Zoom out
- `.` - Zoom to fit
- `,` - Zoom to selection

#### Tool Selection
- `B` - Brush tool (draw/paint)
- `E` - Eraser tool
- `V` - Selection tool
- `F` - Free selection tool
- `H` - Hand/Pan tool
- `N` - Note tool
- Hold `Space` - Temporarily pan while the canvas is focused and the selection tool is active

#### Size Adjustment
- `[` - Decrease brush/eraser size
- `]` - Increase brush/eraser size

#### Other Actions
- `Delete` or `Backspace` - Delete selected items
- `Shift + Z` - Undo (canvas focused)
- `Shift + Y` - Redo (canvas focused)
- `M` - Start/stop audio recording
- `Cmd/Ctrl + Enter` - Submit/generate (when input is focused)

### Importing and Exporting

**Session Snapshots**: Export your entire workspace (media, notes, annotations, settings) as a `.bcsnap` binary snapshot. Import snapshots from the file menu to restore a saved workspace state. Exporting a snapshot starts an autosave session and enables restore from `File -> Backups`.

**Individual Media**: Export selected images, videos, or audio using the download action in the toolbar.

### Media Actions (Selected Item)
- **Transform**: Select a single image to reveal the inline `Transform` button beside the crop control. Drag corners to scale, edges to scale on one axis, and the top circle to rotate. Hold Shift to free-transform.
- **Crop**: Available for images only (videos/audio are disabled).
- **Resize**: Select an image and use the Resize control to enter exact pixel sizes.
- **Duplicate + Layering**: Duplicate media and adjust layer order with the inline actions.
- **Playback**: Select audio/video and hit play to preview, or capture a still frame from video.

### Blind Test Mode
Use Blind Test Mode for unbiased model comparisons:
- Click the spy icon (left of the info icon) in the bottom-right toolbar to enable
- All model names in dropdowns become random codenames (e.g., "Swift Falcon", "Silent Panther")
- Codenames stay consistent within a session but reset on page refresh
- Click the icon again to reveal the real model names
- Metadata overlays still show original model names for reference after testing

**Open-source alias mode**: Option/Alt + click the spy icon to swap select model names for neutral aliases instead of codenames.
