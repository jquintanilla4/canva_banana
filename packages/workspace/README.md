# Private Canva Banana workspace

`@canva-banana/workspace` is the existing editor as an embeddable React component. The standalone Canva Banana web and Electron apps use this same implementation. Storyboard migration is a separate follow-up task.

## Build and install

From the Canva Banana repository, run `npm ci`, `npm run pack:workspace`, and `npm run pack:runtime`. The commands put versioned `.tgz` files in `/tmp`; nothing is published. Copy those release artifacts into the consuming project's artifact storage and install them with `npm install --save-exact /path/to/canva-banana-workspace-0.2.8.tgz`. Install the matching runtime tarball in the host's trusted Node/Electron package when using its services. Keep the lockfile and both artifacts available for reproducible installation and rollback.

The browser package contains compiled ESM, TypeScript declarations and CSS; React/ReactDOM are peers, and all SDK/icon/ZIP code is bundled. It needs no host Tailwind configuration or source aliases. React 19 is the currently declared/tested peer. A React 18 host must verify compatibility or upgrade in its own migration task; this extraction does not change Storyboard's React version.

```tsx
import { useRef } from 'react';
import { Workspace, type WorkspaceHandle } from '@canva-banana/workspace';
import '@canva-banana/workspace/style.css';

export function Editor() {
  const editor = useRef<WorkspaceHandle>(null);
  return <div style={{ height: 720 }}>
    <Workspace
      ref={editor}
      storageNamespace="my-app:project-123"
      config={{ secureBackendApiBaseUrl: 'http://127.0.0.1:8787' }}
      onStateChange={state => console.log(state.mediaCount, state.busy, state.error)}
    />
  </div>;
}
```

Give the containing element an explicit height. UI styles, resets and density are scoped to the editor and its portal; importing CSS does not resize the document root. Use a modern browser/Electron with CSS `@scope` and `AbortSignal.any`. A wide desktop panel (about 1000px or more) is recommended for the full toolbar. Host controls can be rendered as `Workspace` children, and remain owned by the host.

One workspace may be mounted per browser window. Multiple separate Electron windows are supported because they have separate renderer modules. Supply a stable, non-secret `storageNamespace` per project; standalone Canva Banana retains its original unprefixed stores. This namespace scopes browser stores; native backup/chat/settings ownership comes from the injected bridge, so the host must scope those bridge operations to the intended project/profile. Configuration, bridge and namespace are initial session values: change the React `key` to switch runtime/project, after saving any unsaved work. Requests, playback and source leases are cleaned up on teardown; remote provider jobs already submitted may continue remotely.

## Host operations

The editor initializes after its outer container mounts, so a parent mount effect may still see a null ref. For an initial shot, use a stable callback ref to react when the handle is attached:

```tsx
const attachEditor = useCallback((handle: WorkspaceHandle | null) => {
  editor.current = handle;
  if (handle) void handle.loadMedia(shotFile, { prompt: shotPrompt }).catch(reportError);
}, [shotFile, shotPrompt, reportError]);
// Render <Workspace ref={attachEditor} ... />. Import useCallback from React.
```

The callback receives null on teardown; save work before unmounting. Promise-returning methods reject on invalid input, unavailable capabilities, busy operations or a closed session; handle rejected promises in host controls. Synchronous prompt/checkpoint methods throw on invalid operations. `onStateChange` reports media count, generation busy state and the editor's displayed error/status. For the host diagnostic panel, `getDebugLogs()` and `subscribeToDebugLogs(listener)` expose the existing bounded log buffer; call the returned unsubscribe function on teardown. Logs clear when a workspace closes and may contain prompts/media URLs, so apply the host's privacy policy before persisting them. Do not put provider secrets in diagnostics.

| Operation | Contract |
| --- | --- |
| `loadMedia(file, { prompt })` | Replace the canvas with one still image and its prompt. Video/audio still work through the normal canvas upload controls. Invalidates older host loads and detaches the previous snapshot/autosave destination so a shot edit cannot overwrite an unrelated project. |
| `setPrompt(text)` | Change the generation prompt. |
| `createCheckpoint()` | Retain an opaque, session-owned canvas/prompt checkpoint without serializing large media into JavaScript buffers. |
| `restoreCheckpoint(token)` | Restore canvas content and prompt, clear selection, fit the view and detach the save destination. It does not restore provider controls, camera settings or a previous filesystem save target. |
| `releaseCheckpoint(token)` | Release a checkpoint when accept/reject is finished. Current history keeps any necessary source leases until the last reference disappears. Owned playback URLs are swept on the next canvas-history change or unmount; releasing a checkpoint while the editor is idle can retain its playback buffer until then. Tokens do not survive unmount. |
| `exportImage(type?)` | Export the first canvas image as PNG/JPEG/WebP at intrinsic resolution. This matches the existing Storyboard acceptance behavior; it is not a composite of all layers/annotations. |
| `writeSnapshot(destination)` | Write the complete project through an async `write(chunk)` destination. Handles lazy media and preserves bounded streaming; the host owns commit/abort and final file placement. |
| `importSnapshot(source)` | Import a File or supported range source. Host API failures reject. A host-managed import does not enable background overwrite of the input file. |

For a future timeline: capture a checkpoint, load the selected shot and prompt, export/save on accept, or restore on reject; then release the checkpoint. Keep timeline entries, output paths and accept/reject UI in the consuming repository.

For native integration, provide the exported `DesktopBridge` contract as `desktopBridge`. It exposes specific clipboard/file/settings operations rather than raw Electron IPC. Native file support includes streaming writes, bounded chunks, range reads, lazy media URLs, leases and backup operations. The host implements and validates those operations in its own preload/main process. The existing Canva Banana app supplies its existing bridge; the library does not take over application menus, app icons, trial policy or process lifecycle. Pass `standalone` only when the workspace owns the entire app window and native chrome.

## Saved-project compatibility

The current binary `.bcsnap` format and supported Canva Banana legacy JSON remain supported. A compatibility reader recognizes the image-only version-2 Storyboard JSON schema from committed `feat/reforacle`. It preserves media/settings and converts rectangle-note text and position to modern pinned notes. Rectangle width/height/font/background styling has no equivalent in modern notes. A filename alone does not establish format compatibility. Legacy/read-only imports never acquire a writable autosave target implicitly.

## Development and verification

`npm run test:workspace` runs the editor tests; `npm run smoke:workspace` packs the library/runtime, installs them outside the monorepo with the verified dependency lock, and runs strict TypeScript and production builds. Then run `npx playwright install chromium` once and `npm run test:consumer` for browser acceptance. The smoke command prints the temporary consumer directory; `npm run dev` there opens the host fixture on port 3100.

For package source changes, run `npm run build:workspace` before starting/reloading the standalone consumer. Root typechecking builds declarations first. UI/native acceptance and actual live-provider checks remain separate from mocked provider contracts.

To upgrade privately, build matching new versioned artifacts, install them in the consumer and rerun its checks. Keep host customizations outside package source. To roll back, reinstall the previous artifacts/lockfile and restore compatible project backups; never automatically downgrade/overwrite saved files.
