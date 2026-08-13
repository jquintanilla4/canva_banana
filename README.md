# Canva Banana

_Canva Banana is still in active development, so you may run into bugs._

Canva Banana is a creative workspace for making and editing images, videos, and audio with AI. Everything lives on one large canvas, so you can keep your source material, experiments, notes, and finished results together.

## What You Can Do

- **Create with different AI models:** Generate images and videos, edit existing media, upscale images, animate pictures, and create lip-synced video.
- **Organize everything on one canvas:** Drag in images, videos, and audio, then move and arrange them freely.
- **Edit visual content:** Crop, resize, rotate, transform, duplicate, remove backgrounds, reorder layers, and capture still frames from videos.
- **Draw and take notes:** Use the brush, eraser, free selection, and note tools to mark up ideas directly on the canvas.
- **Work with sound:** Preview audio, view waveforms, and record audio inside the app.
- **Ask for prompt help:** Use the optional AI chat to develop or improve generation prompts.
- **Compare models fairly:** Hide model names with Blind Test Mode when you want to judge results without brand bias.
- **Save complete projects:** Export a `.bcsnap` snapshot containing your media, notes, annotations, and settings. Backups make it possible to return to earlier saved states.
- **Follow generation progress:** View queued and running Fal.ai jobs without leaving your workspace.

## A Simple First Project

1. Drag a file onto the canvas, use the upload control, or start with a written prompt.
2. Choose the kind of result you want and select an AI model.
3. Generate your result. You can continue working while longer jobs run.
4. Move, resize, compare, or edit the results on the canvas.
5. Download individual media files when they are ready.
6. Export a project snapshot if you want to reopen the complete workspace later.

## Running the App

This repository currently contains the source code rather than a one-click installer. The steps below are intended for anyone who wants to run the project on a Mac or in a web browser. You do not need to understand the code, but you will need to install a few development tools and enter commands in the Terminal app.

### Before You Begin

Install:

- [Node.js](https://nodejs.org/) and npm
- [`uv`](https://docs.astral.sh/uv/) for the local video service
- `make`, which is included with Apple's Command Line Tools on macOS

Then open Terminal, move into this project folder, and install the project dependencies:

```bash
npm install
npm -w @canva-banana/python-backend run sync
```

### Easiest Option: Mac Desktop App

Run:

```bash
npm run dev:desktop
```

This one command starts the app and its local services. It waits until everything is ready, then opens the desktop window.

### Browser Version

Start the web app:

```bash
make dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

AI features that use the local services also need this command running in a second Terminal window:

```bash
make dev-backends
```

## Connecting AI Services

Different features use different AI providers. You only need credentials for the services you plan to use.

| What you want to use | What you need |
| --- | --- |
| Google Gemini image features | `GEMINI_API_KEY` |
| Fal.ai image and video models | `FAL_API_KEY` |
| Optional prompt chat | `OPENROUTER_API_KEY` |
| HeyGen prompt timing assistance | `MOONSHOT_API_KEY` |
| Direct Volcengine Seedance 2 | `ARK_API_KEY`, `VOLCENGINE_ACCESS_KEY`, and `VOLCENGINE_SECRET_KEY` |
| Seedance 2, Seedance 2.5, and Multi-frame through Jimeng | Complete the Jimeng CLI setup shown inside the app; CLI 1.4.15+ is required |

In the desktop app, open Settings and enter the credentials there. For browser development, create a file named `.env.local` in the project folder and add each credential on its own line:

```text
GEMINI_API_KEY=your_key_here
FAL_API_KEY=your_key_here
OPENROUTER_API_KEY=your_key_here
```

Only add the keys you need. Do not share this file or commit it to Git. Fal.ai, Moonshot, and OpenRouter credentials are handled by the local secure backend instead of being placed in browser-side JavaScript.

## Using the Canvas

### Working with Media

- Select an image to crop, resize, rotate, transform, duplicate, or change its layer position.
- Drag corner handles to scale an image, edge handles to scale one direction, and the top handle to rotate.
- Hold `Shift` while transforming when you do not want the original proportions preserved.
- Select audio or video to play it. Videos can also be turned into still images with frame capture.
- Use the download action to save a selected image, video, or audio file.

### Saving and Reopening a Project

A project snapshot stores the complete workspace in one `.bcsnap` file, including media, notes, annotations, and settings.

- Choose the snapshot export option to save the workspace.
- Import a `.bcsnap` file to reopen it.
- After a writable `.bcsnap` snapshot is exported or imported, automatic backups begin for that project.
- Legacy JSON snapshots, including ones renamed to `.bcsnap`, and read-only imports must be exported before autosave can update them.
- Use `File > Backups` to browse and restore available backups.

Snapshots support large media projects. Saving or opening one may take longer when it contains large videos or many files.

### Blind Test Mode

Blind Test Mode helps you compare AI models without being influenced by their names:

1. Click the spy icon near the bottom-right corner.
2. Model names are replaced with consistent random codenames for the current session.
3. Generate and compare the results.
4. Click the spy icon again to reveal the real model names.

Hold `Option` or `Alt` while clicking the spy icon to use neutral aliases for selected models instead of random codenames.

## Keyboard Shortcuts

### Moving Around

| Shortcut | Action |
| --- | --- |
| `+` or `=` | Zoom in |
| `-` or `_` | Zoom out |
| `.` | Fit the canvas on screen |
| `,` | Zoom to the selected item |
| Hold `Space` | Temporarily pan the canvas while using the selection tool |

### Tools

| Shortcut | Tool |
| --- | --- |
| `V` | Selection |
| `F` | Free selection |
| `H` | Hand/pan |
| `B` | Brush |
| `E` | Eraser |
| `N` | Note |
| `[` | Make the brush or eraser smaller |
| `]` | Make the brush or eraser larger |

### Other Actions

| Shortcut | Action |
| --- | --- |
| `Delete` or `Backspace` | Delete selected items |
| `Shift + Z` | Undo while the canvas is focused |
| `Shift + Y` | Redo while the canvas is focused |
| `M` | Start or stop audio recording |
| `Cmd/Ctrl + Enter` | Submit a focused prompt |

## Troubleshooting

### `vite: command not found`

The project dependencies are missing. Run:

```bash
npm install
```

### An AI feature says credentials are missing

Open the desktop Settings screen or check your `.env.local` file. Make sure you added the credential for that specific provider, then restart the app and local services.

### Seedance or Jimeng is unavailable

Make sure the Python dependencies have been installed:

```bash
npm -w @canva-banana/python-backend run sync
```

Then confirm that the local backends are running. Jimeng also requires the one-time setup shown in the app. Its Login action now uses OAuth Device Flow: open the displayed authorization page, enter the short code, and choose **Check Login**. If video generation returns `AigcComplianceConfirmationRequired`, complete one generation with that model on the Dreamina website and retry.

## Developer and Maintainer Reference

### Common Commands

```bash
npm run dev:web
npm run dev:backends
npm run lint
npm run typecheck
npm run test
npm run build
npm run preview
```

- `npm run test` runs all workspace test suites once.
- `npm run test:watch` starts the web test watcher.
- `npm run test:web`, `npm run test:desktop`, `npm run test:secure-backend`, and `npm run test:python-backend` run individual test suites.
- `make web-dev`, `make secure-backend-dev`, and `make backend-dev` start individual parts of the project.

### Local Services

- The secure Node backend runs on `127.0.0.1:8787` by default. It handles Fal.ai, Moonshot, and OpenRouter requests.
- The Python backend runs on `127.0.0.1:8000` by default. It supports Volcengine and Jimeng workflows.
- Both backends read `.env.local` first and fall back to `.env`. Exported shell variables take priority.
- More Seedance backend details are available in [apps/python-backend/backend/README.md](apps/python-backend/backend/README.md).

Optional configuration:

- `SECURE_BACKEND_API_BASE_URL` points the web frontend to another secure backend.
- `SECURE_BACKEND_ALLOWED_ORIGINS` lists trusted browser origins separated by commas.
- `NODE_BACKEND_HOST` and `NODE_BACKEND_PORT` change the secure backend address.
- `FAL_API_URL` points the Fal SDK to another proxy.
- `FAL_MODEL_ID` changes the default Fal image model.
- `VOLCENGINE_FFPROBE_PATH` selects a custom `ffprobe` binary.

### Building the Mac App

```bash
npm run build:desktop
npm run package:mac
npm run make:mac
```

- `npm run build:desktop` prepares the desktop resources without opening the app.
- `npm run package:mac` creates the packaged macOS application.
- `npm run make:mac` creates distributable artifacts.
- `npm -w @canva-banana/desktop run start:built` builds and launches the finished desktop app.

Local artifacts are ad-hoc signed. A build shared with another Mac must use an Apple Developer ID certificate and Apple notarization:

```bash
export APPLE_SIGNING_IDENTITY="Developer ID Application: Your Company Name (TEAMID)"
export APPLE_NOTARIZE_KEYCHAIN_PROFILE="the-institute-notary"

xcrun notarytool store-credentials "the-institute-notary" \
  --apple-id "you@example.com" \
  --team-id "TEAMID" \
  --password "app-specific-password"
```

CI may use `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, and `APPLE_TEAM_ID` instead of a stored keychain profile. Verify a finished notarized build with:

```bash
spctl --assess --type execute --verbose "out/The Institute-darwin-arm64/The Institute.app"
xcrun stapler validate "out/The Institute-darwin-arm64/The Institute.app"
```

Packaged desktop builds use the managed secure backend by default. QA can opt into an external backend by setting `SECURE_BACKEND_API_BASE_URL` and `CANVA_BANANA_ALLOW_EXTERNAL_SECURE_BACKEND=1`. If that backend requires desktop authentication, use the same secret for `CANVA_BANANA_EXTERNAL_SECURE_BACKEND_AUTH_TOKEN` in the app and `CANVA_BANANA_DESKTOP_AUTH_TOKEN` in the backend.
