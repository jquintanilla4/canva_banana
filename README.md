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

**Prerequisites:**  Node.js

### Setup Steps

1. **Install dependencies** (⚠️ Required - don't skip this!):
   ```bash
   npm install
   ```

2. **Set up environment variables:**
   - Set `GEMINI_API_KEY` in [.env.local](.env.local) for Google Gemini.
   - Set `FAL_API_KEY` for Fal.ai.
   - Optional: `FAL_API_URL` to point at a different gateway.
   - Optional: `FAL_MODEL_ID` to override the default Fal image model.
   
   If `FAL_API_KEY` is not set, the Cloud switcher only shows Google and Fal-specific controls stay disabled. If both providers are configured, use the Cloud switcher to pick a provider per request.

3. **Run the app:**
   ```bash
   npm run dev
   ```

   The Vite dev server runs on `http://localhost:3000`.

### Seedance 2 Backend

Seedance 2 uses the local FastAPI backend in [backend/README.md](backend/README.md).

```bash
uv sync --project backend
uv run --project backend uvicorn volcengine_service.main:app --app-dir backend/src --reload --host 0.0.0.0 --port 8000
```

- `uv sync --project backend` installs a bundled `ffprobe` fallback for reference audio/video validation.
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
