<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/drive/1LRCJ0zSN4fC2Lt1H-aYp6qwHNY2WOh6A

## Features

- **Multi-brand AI Image Generation** - Generate images from various AI models including multiple Fal.ai endpoints
- **Infinite Canvas** - Large, scrollable workspace for image creation and editing
- **Professional Drawing Tools**:
  - Brush and eraser with independent size controls
  - Pen tool for annotations
  - Hand tool for easy canvas navigation
- **Image Manipulation**:
  - Multiple upscale models (e.g., fal-ai/proteus-v2, seed-v2)
  - Background removal
  - Image import/export in various formats
- **Project Management**:
  - Import/export workspace snapshots
  - Save/load individual images
  - Session persistence
- **Keyboard Shortcuts** - Speed up workflow with hotkeys for common actions
- **Metadata Overlays** - View generation parameters for AI-created images
- **Debug Panel** - Advanced logging and error monitoring

## Run Locally

**Prerequisites:**  Node.js

### Setup Steps

1. **Install dependencies** (⚠️ Required - don't skip this!):
   ```bash
   npm install
   ```

2. **Set up environment variables:**
   - Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key.
   - (Optional) Add `FAL_API_KEY` to target Fal.ai. This app calls the `fal-ai/nano-banana/edit` endpoint by default and accepts `FAL_API_URL` if you need to point at a different gateway.

3. **Run the app:**
   ```bash
   npm run dev
   ```

### Troubleshooting

**Error: `sh: vite: command not found`**
- This means dependencies weren't installed. Run `npm install` first before running `npm run dev`.

## Usage

### Keyboard Shortcuts

#### Zoom Controls
- `+` or `=` - Zoom in
- `-` or `_` - Zoom out

#### Tool Selection
- `B` - Brush tool (draw/paint)
- `E` - Eraser tool
- `V` - Selection tool
- `F` - Free selection tool
- `H` - Hand/Pan tool
- `N` - Note tool

#### Size Adjustment
- `[` or `{` - Decrease brush/eraser size
- `]` or `}` - Increase brush/eraser size

#### Other Actions
- `.` (period) - Zoom to fit
- `Delete` or `Backspace` - Delete selected items
- `Cmd/Ctrl + Enter` - Submit/generate (when input is focused)

### Importing and Exporting

**Session Snapshots**: Export your entire workspace (images, annotations, canvas state) as a JSON snapshot file. Import snapshots to restore previous sessions.

**Individual Images**: Export selected images as PNG files for use in other applications.
