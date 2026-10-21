# Reusable workspace library extraction

Status: library implementation and review committed; ready for pull-request review against dev. Storyboard migration remains deferred.
Last updated: 2026-10-15 (America/Los_Angeles).

## Resume here after a compaction

1. Read this file, the applicable `AGENTS.md`, and the latest user instructions.
2. Work in the managed Canva Banana worktree below, not the original checkout. Check `git status` and inspect existing changes before editing.
3. Start with the first unchecked milestone. Read its code and callers before changing it; the file map below is a starting point, not a substitute for inspection.
4. Update checkboxes, decisions, changed paths, verification evidence, and the next action after each meaningful chunk of work and before ending a turn.
5. Record a check as passed only after actually running it. Separate failures caused by the change from pre-existing failures and unavailable external services.
6. Completion requires the extracted library, both original Canva Banana apps, and an independent packed consumer smoke test. Actual Storyboard migration is a separate follow-up and is not a completion gate here.

**Next action:** use the reviewed library revision from `codex/reusable-workspace-library` in a separate Storyboard thread/worktree. Preserve the committed `feat/reforacle` starting-state decision and the deferred migration requirements below.

## Goal and agreed ownership

Extract and validate Canva Banana as a private, versioned library. Canva Banana web/Electron apps and an independent packed consumer validate this task. Storyboard on committed `feat/reforacle` is a read-only reference for the future integration; do not modify it, create a migration checkout, or replace its editor in this task. The future migration will happen in its own Codex thread/worktree from the Storyboard repository.

| Owner | Responsibilities |
| --- | --- |
| Shared library in Canva Banana | Canvas, tools, selection/history, generation controls, provider integrations, media handling, snapshot support, and the minimal host-facing editor API. |
| Canva Banana apps | Standalone mounting, application menus/titlebar, app identity/icons/trial policy, settings, and host service lifecycle. |
| Storyboard | Step 6/7 shot timeline, selecting a shot and its prompt, accept/reject workflow, writing accepted output to the original shot file, pipeline handoff, host credentials/project selection, and diagnostics. |

Storyboard-specific UI and business rules remain in Storyboard. Add connection points to the library rather than embedding Storyboard types or importing Storyboard source. Canva Banana should consume the same library that Storyboard installs.

### Scope boundaries

- Private distribution first; use versioned package tarballs with compiled JavaScript, declarations, and CSS. Public npm publishing, public licensing work, and release marketing are deferred.
- Support React web apps and React Electron renderers first. Do not add Vue/Angular wrappers, collaboration, a generic plugin framework, or unrelated UI redesign.
- Preserve current Canva Banana image/video/audio features and provider behavior. Host capabilities may determine which features are available; do not silently remove existing features during extraction.
- Storyboard's batch pipeline/provider code in `packages/core` is outside the editor replacement. Do not imply that installing the editor updates those pipeline implementations. Revisit only if the user expands scope.
- Updating a packaged host still requires upgrading the library/runtime release and rebuilding the host. No automatic runtime updates are planned.
- Implementation is now authorized. Keep this plan current throughout execution.

## Workspace and baseline

| Item | Recorded value |
| --- | --- |
| Original Canva Banana checkout | `/Users/jquintanilla/Developer/canva_banana` |
| Managed implementation worktree | `/Users/jquintanilla/.codex/worktrees/reusable-workspace-library/canva_banana` |
| Worktree source | Local `dev`, clean at creation |
| Canva Banana baseline commit | `cb21dbe502338fbe409dc58af6a4ed9c3693b1d2` |
| Worktree Git state at creation | Detached HEAD; implementation is now on `codex/reusable-workspace-library` |
| Storyboard checkout inspected | `/Users/jquintanilla/Developer/storyboard_gen` |
| Storyboard target branch | `feat/reforacle` |
| Storyboard committed baseline | `645f63538c52f101a4813ad7525a276e4c399f9f` |
| GitHub branch verification | GitHub matched that Storyboard commit during investigation |

Storyboard is read-only in this task. Use committed `feat/reforacle` source (`git show` or GitHub at the recorded commit), not its uncommitted edits. An untouched temporary migration worktree was created before the scope clarification and has now been removed. No Storyboard application files were modified.

## Verified findings and source map

Paths in this table are relative to the named repository. Recheck them if source moves.

| Concern | Canva Banana | Storyboard |
| --- | --- | --- |
| App entry and editor | `apps/web/index.tsx`, `App.tsx`, `components/Canvas.tsx` | `packages/desktop/src/renderer/image-editor/App.tsx`; `app/components/ImageEditorToolHost.tsx` and `AppViewSwitch.tsx` |
| Build and package graph | Root `package.json` currently includes only `apps/*`; `apps/web/package.json`, `vite.config.ts`, `tsconfig.json` | Root workspace config; `packages/desktop/package.json`, `vite.config.ts`, TypeScript and Electron build config |
| Configuration/native integration | `apps/web/services/runtimeConfig.ts`, `hooks/useDesktopIntegration.ts`; `apps/desktop/preload.cjs`, `main.mjs` | Editor `runtimeConfig.ts`; `src/shared/ipc.ts`, `src/preload/index.ts`, `src/main/ipc/imageEditorIpc.ts` |
| Provider transport | `apps/web/services/fal/client.ts`, `secureBackendService.ts`, `geminiService.ts`, Jimeng/Volcengine services; `apps/secure-backend/src/server.mjs`; Python service | Editor `services/fal/ipcClient.ts`; main `falBridgeState.ts`, `services/falSubscribeInputGuardService.ts`, runtime/credential services |
| Snapshot persistence | Web snapshot services/hooks, browser working sources, backups; desktop chunked writes, range reads, protocol URLs and source leases | Editor snapshot services/hooks, backup store; main `services/imageEditorSnapshotService.ts` |
| Lifecycle | History/media cleanup, async generation, timers, playback, snapshot resources | Editor `hooks/useImageEditorSession.ts`, runtime reset and diagnostics teardown |
| Styles and input | `apps/web/index.css`, `utils/uiScale.ts`, portals, viewport calculations, `hooks/useKeyboardShortcuts.ts` | Renderer `styles.css`, editor container inside host shell |
| Host-specific editing | Minimal new host API required | Editor `App.tsx` timeline handlers, `components/ImageTimeline.tsx`, `EditModeControls.tsx`, shared timeline IPC and image preview URLs |
| External editor callers | Search after extraction | `app/controller/DesktopAppController.tsx` imports editor diagnostics; `video-editor/services/fal/videoGenerate.ts` imports editor Fal upload helper |
| Tests/build delivery | Existing web/desktop/backend tests, `.github/workflows/checks.yml`, desktop resource preparation/verification | Editor snapshot, Fal IPC, diagnostics, runtime, input guard and timeline tests; desktop builds |

Important findings:

- Canva Banana is React 19; Storyboard is React 18. Declare only React peer versions that are tested. Do not bundle a second React runtime into a React host.
- Canva Banana currently assumes a full-window layout, modifies root font sizing, portals into `document.body`, and handles shortcuts on `window`.
- Configuration includes Vite-only replacements and a Canva-specific global native bridge. Some configuration and provider clients are module-level singletons.
- Storyboard's separate model allowlist and request validators would continue to require hand edits if only the renderer were shared.
- Storyboard snapshots are image-only version-2 JSON with embedded media. Current Canva Banana has a distinct binary format and a different legacy JSON schema. Both may use `.bcsnap`; filenames do not prove compatibility.
- Backup storage uses `banana-canvas-backups` in both apps. Define project/host ownership and migration before changing storage names or retention behavior.
- Storyboard unmounts the editor when changing views and keys it by diagnostic scope. Preserve cancellation and prevent late results from affecting a different project/window.

## Proposed architecture and decisions to settle in milestone 1

Start with one reusable UI package under `packages/` (proposed name `@canva-banana/workspace`). Move ownership of reusable source there and keep `apps/web` as a thin standalone consumer. Do not leave a second renderer implementation or make the package import source from `apps/`.

The renderer and trusted provider execution must be reusable together. Prefer extracting the existing secure service/runtime behind explicit host configuration rather than writing a new provider implementation for Storyboard. Use a separate runtime package or explicit server/Electron entry points only where the process boundary needs them. Keep Node/Electron/Python code out of browser entry points. Python/CLI resources still need an explicit versioned packaging and lifecycle story; an npm tarball alone does not install every native runtime.

| Decision | Initial direction | Required evidence before closing |
| --- | --- | --- |
| Editor host API | Component plus a small typed handle/events for loading media, prompt changes, result export, and workspace checkpoint/restore; only necessary UI attachment points | Demonstrate how Storyboard's existing select/accept/reject handlers call it without private imports |
| Trusted execution | Reuse current provider service/runtime; host supplies credentials, configuration and capabilities | Compare existing HTTP runtime and IPC bridge; select one supported path with shared trusted validation and no duplicated model registry |
| React | Keep one host React instance; verify supported peer versions independently and record any future Storyboard React upgrade requirement | An independent packed-package consumer works on the chosen host versions, including portals and relevant React/DOM features; Storyboard version changes are deferred |
| Snapshot migration | Detect the Storyboard JSON schema explicitly and convert without overwriting the source | Fixtures covering both schemas, media/metadata/notes/history expectations, backups, and cancellation/failure behavior |
| Storage and instances | One editor per view initially; isolate separate projects/windows, configuration and cleanup | Switching projects, unmount/remount, concurrent windows, and existing backups remain correct |
| Private distribution | Versioned tarballs, exact dependency versions, a repeatable build/pack/install path | Install outside the monorepo, without source aliases or access to a sibling checkout |

Record final choices in the decision log. Do not build both transport strategies merely to postpone a choice. New provider support should arrive through the shared release; host credentials, feature policy and required native resources can still require configuration.

## Milestones

### 0. Planning and isolation

- [x] Inspect both repositories and identify Storyboard's real integration.
- [x] Confirm Storyboard's target branch and committed baseline against GitHub.
- [x] Create and attach the managed Canva Banana worktree from `dev`.
- [x] Record scope, known risks, source map, milestones, verification and resume protocol here.
- [x] Implementation requested on 2026-10-15; work started in the managed worktree.

### 1. Confirm contracts and establish baselines

- [x] Read current instructions and baselines. Storyboard is a committed-source, read-only reference; no migration checkout is required or permitted here.
- [x] Inventory imports/callers, colocated tests, build config, native bridge, provider transport and Python/desktop resource paths; the source map is preserved above.
- [x] Baselines recorded: web 1445, desktop 193, secure backend 18 tests passed; typecheck passed. Python baseline was not run before relocation and is recorded separately.
- [x] Settle the decisions above and write down the concrete API and ownership of credentials, files, provider jobs and native services.
- [x] Define host capability behavior, default feature availability and required runtime resources for current providers, including optional chat and Jimeng/Volcengine features.

Exit: a bounded extraction design that can support Storyboard's existing workflow and all current standalone behavior.

### 2. Create the library and make existing apps consume it

- [x] Add `packages/*` to workspaces and define the minimal package exports, compiled output, declaration emission and supported peers.
- [x] Move reusable renderer/components/hooks/services/utils/types and their relevant tests into library ownership; keep `App.tsx` wiring lean.
- [x] Remove Vite-specific environment assumptions from reusable source; supply runtime configuration explicitly from hosts.
- [x] Externalize React/ReactDOM, ship compiled CSS, and handle CSS retention and runtime asset paths in the package exports/build.
- [x] Point `apps/web` at the library; preserve its existing startup, provider selection, features, test behavior and desktop renderer output.
- [x] Update workspace scripts, lockfile, TypeScript resolution, desktop build/resource paths and CI as needed; no dependencies unless the existing tools cannot do the required job.

Exit: original web and desktop renderer use the extracted implementation, with no application-source imports from the published package.

### 3. Make the editor safe to embed and expose host operations

- [x] Use container size for layout, canvas placement and overlays; remove host-wide root sizing/reset side effects from the library.
- [x] Scope CSS and provide a suitable portal target/positioning strategy without changing the surrounding application's styles or layout.
- [x] Scope keyboard shortcuts and focus handling to the active editor; preserve accessibility, input fields and host shortcuts.
- [x] Implement typed media load, prompt, result export and workspace checkpoint/restore operations required by Storyboard.
- [x] Define result semantics explicitly: Storyboard currently accepts the first canvas image. Preserve that behavior unless the user requests composition/export changes.
- [x] Keep timeline/accept/reject UI in the host; add only the minimal control attachment points if required.
- [x] Isolate runtime configuration, caches, diagnostics and persistence between projects/windows; clean up listeners, timers, playback, jobs and media URLs on teardown.
- [x] Preserve source leases while checkpoints or pending exports still use lazy media; do not release resources prematurely.

Exit: the workspace fits inside a host shell and can be controlled without private implementation imports.

### 4. Reuse provider execution and native capabilities

- [x] Extract the chosen trusted runtime path using existing implementations, with explicit credentials/configuration and typed capability/status/error contracts.
- [x] Centralize the model support/validation needed by that path, so adding a supported model does not require maintaining a second Storyboard allowlist.
- [x] Preserve request validation, credential isolation, IPC sender checks, scoped auth tokens, trusted asset handling, queue events and cancellation.
- [x] Avoid scanning the consuming project's parent directories for this repository's `.env` files; hosts explicitly own settings and service startup.
- [x] Reuse or adapt existing service lifecycle and native bridge utilities; do not import the entire standalone Electron main process, menus, trial policy or app identity.
- [x] Support the existing file workflow: streaming snapshot/archive writes, bounded IPC chunks, range reads, lazy media URLs, leases, backup recovery and download completion.
- [x] Define packaging/version compatibility for Python/CLI resources and document the future Storyboard runtime adapter requirements; record any provider that remains unavailable and why.
- [x] Verify development and packaged resource discovery without absolute paths to the original checkout.

Exit: supported editor providers work through the shared implementation in each host; native file support preserves large-media workflows.

### 5. Preserve saved projects and backups

- [x] Add explicit compatibility handling and representative fixtures for Storyboard JSON snapshots, Canva Banana binary snapshots, and supported legacy formats.
- [x] Verify images, notes, paths, prompt/model settings, metadata and rerun inputs survive migration; report any intentional conversion loss before shipping it.
- [x] Preserve original snapshot files and remembered save targets until a successful explicit save/conversion; do not silently overwrite an incompatible file during autosave.
- [x] Define storage namespace/migration and backup discovery/retention so existing backups remain available and one project's cleanup cannot prune another's data.
- [x] Cover cancellation, failed writes, unavailable permissions, stale handles and recovery. Preserve large-media import/open/save/export; no reduced byte limits as a workaround.

Exit: old Storyboard projects remain recoverable and new saves use a documented supported format.

### 6. Validate private delivery and document updates

- [x] Build and pack a versioned release; inspect its contents for missing CSS/types/assets/runtime files and accidental credentials or application-only resources.
- [x] Install the tarball in an independent consumer, with no source aliases, sibling-checkout dependencies or duplicate React runtime; validate Canva Banana web and Electron apps.
- [x] Verify private artifact upgrades/rollback through an independently installed synthetic implementation marker, without copying implementation source into host controls. Keep the trusted provider path reusable for the future Storyboard adapter.
- [x] Document build/pack/install/upgrade, exact version pinning, runtime/native prerequisites, credential setup, and rollback to the previous package/runtime release.
- [x] Update the main README and CI/build scripts for the final implementation; keep this plan's evidence and remaining limitations current.

Exit: the private dependency upgrade is repeatable and reversible.

## Verification and completion gates

Run unit/integration tests first. Use focused checks during implementation, then full required checks when the integration is ready. UI work requires repeatable Playwright coverage and final Computer Use acceptance; compilation alone is not completion.

### Automated evidence to record

- [x] Canva Banana library/web unit and integration tests, typecheck, lint, and production build.
- [x] Desktop/backend tests covering changed runtime, auth, validation, resource packaging, snapshots and backup paths; Python tests when affected.
- [x] Independent consumer tests exercise the host API required by the read-only Storyboard findings: media/prompt loading, accept-style result export, reject-style checkpoint restoration, diagnostics, credentials/configuration and persistence.
- [x] Packed browser consumer smoke test for imports, CSS, assets and a single React runtime.
- [x] Regression for host focus/shortcuts, container resize, portals, API load/export/checkpoint behavior, project switches and unmount/cancellation.
- [x] Migration fixtures and large snapshot streaming/range-read/recovery checks; use representative media and record actual sizes and limits tested.
- [x] Provider contract tests with mocked calls pass. Live/paid provider calls are explicitly unverified; no test credentials were supplied or used, and this is not recorded as a live pass.
- [x] Final required checks in this Canva Banana worktree before completion. Storyboard tests/builds/migration are deferred; no writes to that repository.

### Browser and real GUI acceptance

- [x] Playwright: embed inside a host with other controls, resize, open menus/tooltips, edit text, switch views/projects, and inspect console/network failures.
- [x] Computer Use: original web import/edit/export and Electron import/save/reopen/backup recovery exercised. Browser export required the user to complete the Codex-owned Save dialog. Browser native Open dialog cannot be automated inside Codex; paid generation is unverified. Independent browser snapshot round trips pass.
- [x] Computer Use: independent host controls load media/prompt, export an edited result and restore a checkpoint. These simulate the future timeline/accept/reject contract without changing Storyboard.
- [x] Confirm compatibility fixtures derived from committed Storyboard snapshot schemas load safely, failed/cancelled saves preserve data, and existing Canva Banana large-media workflows still work.
- [x] Confirm the independent consumer uses shared provider/runtime support; distinguish missing credentials/runtime from a package regression.

## Progress and evidence log

| Date | Milestone | Work/evidence | Next action |
| --- | --- | --- | --- |
| 2026-10-15 | 0 | Investigated both repos; GitHub Storyboard head matched local committed baseline. Created attached managed Canva Banana worktree from clean `dev`. Wrote this plan. No application code changed; no test/build/UI runs performed. | Wait for implementation request, then milestone 1. |

Append concise rows with changed paths, exact commands/results, fixture/artifact locations, failures and unresolved items. For paid/provider tests, record provider/model and outcome without logging keys or private media.

## Decision log

| Date | Decision | Reason/status |
| --- | --- | --- |
| 2026-10-15 | Extract from Canva Banana; both standalone apps and Storyboard consume the same versioned implementation. | Agreed with user; eliminates editor forks. |
| 2026-10-15 | Storyboard-specific features remain in Storyboard on top of the library. | Agreed with user; library exposes only required general operations. |
| 2026-10-15 | Private distribution initially; public npm publication deferred. | Agreed with user. |
| 2026-10-15 | Provider execution/validation belongs in the extraction scope alongside UI. | Required to avoid continuing model-list duplication; HTTP Node/Python runtime package selected; existing native bridge remains host-owned. |
| 2026-10-15 | Implementation authorized; migration scope clarified. | Implement only the reusable library in this worktree. |

## Current blockers and limitations

- No implementation blocker. React 19 is the tested peer; one workspace per window and modern CSS `@scope`/`AbortSignal.any` are required. React 18 verification and Storyboard migration are deferred.
- Storyboard remains read-only. Its actual migration and any writes/tests/builds in that repository belong to the separate follow-up task.
- Baseline and current test/build evidence is recorded below. Paid/live generation is unverified; mocked provider contracts are tested. Physical multi-gigabyte GUI import/export is unverified; existing streaming/range/lease regressions retain large logical sizes and no byte limits were reduced.
- Do not silently widen scope to Storyboard pipeline providers or public distribution.

### Implementation checkpoint — 2026-10-15

- User selected **committed feat/reforacle only** as a read-only integration reference. The untouched temporary `/tmp/storyboard-workspace-library` was removed after clarification; no Storyboard application code changed.
- Baselines: web **1445 tests passed**, desktop **193 tests passed**, secure backend **18 tests passed**; existing workspace typecheck passed. Logs: `/tmp/canva-library-baseline-{web,desktop,server,types}.log`. Dependencies installed with `npm ci --ignore-scripts` in the Canva worktree; Electron binary installation is still pending GUI validation.
- Source ownership moved to `packages/workspace/src`; original `apps/web` becomes a thin consumer. Existing colocated tests moved with their source. Runtime environment defaults move to the standalone host; public library exports no longer need Vite environment substitution.
- Direction: reuse the existing HTTP provider runtime for host integration rather than duplicating provider execution/allowlists. Preserve existing native bridge capabilities and streaming persistence. Exact extraction/packaging still to implement.
- React: start with React 19; verify React 18 compatibility in an independent consumer if practical. Do not upgrade or migrate the Storyboard host in this task, and do not declare untested peer versions.
- Next: install/link local workspaces, build package/declarations, run relocated tests; then expose the host API, scope embedding behavior, and extract the runtime. All later milestones remain pending.

## Deferred follow-up: Storyboard migration handoff

This section is **not part of this task's implementation or completion requirements**. Run it from the Storyboard repository in a separate Codex thread/worktree after the library is ready. Preserve the committed baseline and integration source map above.

### Replace Storyboard's copied editor (future task)

- [ ] Install a built private release in the isolated Storyboard checkout and replace the lazy import in `ImageEditorToolHost.tsx`.
- [ ] Keep Storyboard's timeline, shot/prompt loading, accept/reject controls, original-file save logic, Step 6/7 handoff and diagnostics in a small host integration layer.
- [ ] Connect host credentials, provider runtime, project selection and native persistence through the agreed API; preserve refresh after key changes.
- [ ] Adapt cancellation, errors, diagnostic scopes and per-window/project teardown.
- [ ] Redirect the application controller's diagnostic imports and the video editor's Fal upload helper before deleting copied source.
- [ ] Update affected IPC contracts, preload/main wiring, package metadata, types, fixtures, tests and packaged resources; preserve unrelated work.
- [ ] Delete obsolete copied editor/provider code only after all callers use the shared implementation. Keep legitimate Storyboard-specific pieces.

Exit: Storyboard uses the package and its custom features no longer require modifying shared editor internals.


### Scope clarification — 2026-10-15

- User explicitly limited this task to library extraction/validation. Storyboard timeline, accept/reject, credentials, diagnostics and persistence remain API inputs; actual migration is deferred.
- Validate through Canva Banana web/Electron and an independent package consumer. Do not modify Storyboard or require its migration for completion.
- Temporary Storyboard checkout removed; original repository application files remain untouched.

### Library implementation checkpoint — scope corrected

- Storyboard migration is deferred. Only read-only committed-source queries were made after the clarification; its temporary checkout was removed.
- `packages/workspace` owns the renderer and tests. Build emits ESM, CSS scoped with native CSS `@scope`, and declarations; React is external. `apps/web/App.tsx` is now a thin host.
- Added a small ref API for still-image load, prompt changes, first-image export, opaque session checkpoints, snapshot import and streaming snapshot output. Host diagnostics use `onStateChange`; controls remain host-owned children. Checkpoints retain lazy sources and video URLs.
- Explicit runtime config and native bridge injection replace Vite-only settings; singleton ownership intentionally permits one editor per browser window, with multiple separate Electron windows supported. Hosts change the React key for runtime/project changes. Native source/read/write contracts retain existing streaming semantics.
- Extracted Node and Python provider source to `packages/runtime`; existing backend/desktop launchers use this source. Python resources ship with the private runtime package; hosts explicitly own environment directory, credentials and service startup. Existing packaged Python output layout stays unchanged.
- Added scoped storage keys for embedded project namespaces, session abort signals for network/provider work, and explicit Storyboard JSON compatibility. Storyboard rectangle notes become pinned notes with text/location retained; old rectangle size/font/background styling is intentionally not represented by the modern note model. Record this in the migration handoff.
- Validation so far: library build/declarations passed before latest session/migration edits; 69 focused embedding/history/keyboard/config tests passed. Runtime tests passed after source relocation. Full regression, browser/GUI, independent consumer, Python tests and native package checks remain in progress.
- Next: fix any type/test failures, test the public API lifecycle, pack/install into an independent consumer and validate styles/flows; then complete documentation and final acceptance.

### Regression evidence — extraction

- Full relocated library suite passed: **148 files / 1445 tests**, including existing large-media snapshot regressions and added runtime/CSS/Storyboard-format tests. Logs: `/tmp/canva-library-current-tests.log`.
- Extracted Node runtime: **18 tests passed**. Extracted Python service: **148 tests passed**, one existing Starlette deprecation warning. No paid/live generation calls made.
- Library and standalone web production builds passed after extraction (`/tmp/canva-library-app-build.log`); bundle-size warning remains, optimization is not a reason to alter functionality.
- Added API tests for load/export/checkpoint restoration and unmount races; fixed runtime model defaults to resolve at mount/request time. Pending rerun and independent browser validation.

### Independent consumer QA inventory

- Verify host styles/root font remain intact, editor has its container height, overlays/dropdowns render, and resizing updates canvas geometry.
- Exercise load shot/prompt, checkpoint/reject restoration, first-image export, streaming snapshot save/reopen, host text input and unmount/remount. Inspect visible results in Computer Use as well as repeatable Playwright assertions.
- Off-happy-path checks: late loads after unmount, invalid/released checkpoints, failed import rejection, old snapshot conversion, and preserving the previous file's autosave target.
- Package smoke now installs from tarballs with the verified dependency lock; strict TypeScript and production build passed. A first visual pass found that a scoped root selector did not size the root; changed it to explicit `:scope` selectors. Revalidation is in progress.
- Headless Playwright requires an escalated shell on this host because the restricted REPL blocks macOS process registration/loopback access. Computer Use through the in-app browser works. No change to user security settings is required.

### Final contracts and release checkpoint — 2026-10-15

- Source now lives in `packages/workspace/src` and `packages/runtime/{node,python}`; the source map above records **pre-extraction** paths for the future migration investigation. Standalone web is a thin consumer; native services keep host-owned lifecycle and menus.
- Public UI contract: `Workspace`, typed handle/state/checkpoint/config/bridge/snapshot types, `getDebugLogs`/`subscribeToDebugLogs`. Host owns shot timeline, accept/reject buttons and accepted output paths. Export is the first image at intrinsic resolution; checkpoints restore canvas/prompt, not provider/camera/save-target state. Runtime/project changes remount with a React key.
- Private delivery: matching version 0.2.8 UI/runtime tarballs, React 19 external peers, compiled scoped CSS/types, no host source aliases. Runtime includes Python source/lock, not a prebuilt native executable. Node credentials/auth/capabilities and explicit Python environment directory are documented in both package READMEs.
- Existing standalone storage keys remain unchanged; embedded project namespaces isolate backups/chat/preferences. Host imports/load/restore detach prior writable snapshot targets. Checkpoints retain lazy source leases/history media until release. Native sources capture their original bridge so cleanup survives renderer teardown.
- Renderer requests abort on unmount; Fal operations retain the originating session through upload/polling. Already-submitted remote jobs may continue remotely. Diagnostics clear on teardown; host subscriptions must unsubscribe, and saved diagnostics need the host privacy policy.
- Storyboard schema compatibility is explicit, preserves image metadata/settings, paths/prompt and note text/position, and never overwrites the legacy source. Rectangle note dimensions/font/background are intentionally converted away. The existing binary/legacy snapshot and bounded streaming tests remain supported.
- Latest editor suite: **149 files / 1448 tests passed** (`/tmp/canva-library-final-web-tests.log`). Lint and package/type checks are being finalized after the diagnostic export and synthetic upgrade test.
- Previously completed: Python **149 passed** (one existing Starlette warning), Node runtime **18 passed**, desktop **193 passed**, full desktop resource/PyInstaller build passed. Logs: `/tmp/canva-library-final-python.log`, `/tmp/canva-library-runtime-tests.log`, `/tmp/canva-library-native-regressions.log`, `/tmp/canva-library-desktop-build.log`.
- Native Computer Use already imported an SVG through the OS chooser, exported `/tmp/canva-library-native-check.bcsnap`, and reopened it successfully in an isolated QA profile. Remaining acceptance: refreshed standalone web and independent-host controls after final CSS build; native backup discovery.
- No Storyboard files were changed. Follow-up must start from its own repository/thread and inspect the committed baseline **645f63538c52f101a4813ad7525a276e4c399f9f** against its then-current state before migration.

### Final validation and delivery — 2026-10-15

All required **library-scope** implementation and automated checks passed. Remaining limitations are explicitly recorded, not treated as live-provider or large-physical-file passes.

| Check | Final evidence |
| --- | --- |
| Editor unit/integration | `npm run test:workspace`: **149 files / 1451 tests passed**, `/tmp/canva-library-final-web-tests.log` |
| All workspaces | `npm test`: desktop **193**, Python **149**, Node runtime **18** (also exercised through backend wrapper), web host **3**, editor **1450** before the final checkpoint regression; the final editor rerun above adds that test. `/tmp/canva-library-final-all-tests.log` |
| Types and lint | `npm run typecheck`, `npm run lint` passed. `/tmp/canva-library-final-{types,lint}.log` |
| Packed release | `npm run smoke:workspace` passed: file inspection, independent install, strict TypeScript **without skipLibCheck**, production build, mocked provider/auth runtime and installed Python resources. Synthetic artifact upgrade/rollback passed without host source changes. `/tmp/canva-library-consumer-build.log` |
| Browser behavior | `npm run test:consumer` passed: host styles/input, bounded resizing, portal menu, media/prompt, export, checkpoint restore, streamed snapshot round trip, unmount/remount, no page errors. `/tmp/canva-library-browser-test.log`; screenshot `/tmp/canva-library-consumer.png` |
| Desktop resources | `npm run build:desktop` passed, including final shared web build, PyInstaller output and `verifyPackageResources`. `/tmp/canva-library-desktop-build.log` |
| Computer Use | Independent host load/export/save/restore/reopen visibly passed. Standalone web SVG import, duplicate/undo, prompt editing and export passed (user completed Save). Native import/export/reopen and **backup list + pointer-click restore** passed in `/tmp/canva-library-native-profile`; restored source remained read-only. Native accessibility activation of Load was unreliable, so acceptance used its visible button with a pointer click. |
| Large media coverage | Existing streaming regressions include actual **8 MiB + 1 byte** media spanning chunks and **64 MiB** metadata; mocked **512 MiB + 1** legacy size and **64 GiB** native lazy-media capability. GUI sample snapshots were about **3 KiB**. No reduced product size limit; physical multi-gigabyte GUI workflows were not run. |

Release artifacts are `/tmp/canva-banana-workspace-0.2.8.tgz` and `/tmp/canva-banana-runtime-0.2.8.tgz`. Both are private, independently installable artifacts; nothing was published. Upgrade smoke used a synthetic prerelease package/marker solely inside its temporary directory, then rolled back to the genuine 0.2.8 artifact.

API/setup/upgrade documentation: `packages/workspace/README.md`, `packages/runtime/README.md`, linked from the main README. CI now runs packed and browser consumer checks. Source changes remain **uncommitted** on `codex/reusable-workspace-library`; no push or PR was requested.

Final limits: React 19 only; one editor per browser window; modern `@scope`/`AbortSignal.any` support; native project storage and trusted service lifecycle are host responsibilities; Python ships as source and requires target-specific native packaging. Large physical GUI and paid/live provider calls remain unverified. Bundle size warning remains (about 369 KiB gzip for the library entry plus lazy ZIP code). Signing/notarizing a complete macOS distributable was not part of this extraction check.

Storyboard migration completion is deliberately excluded. Keep timeline/accept/reject, original-shot persistence, credentials and diagnostics in that future host adapter, verify React 18 vs 19, redirect external diagnostic/Fal-upload callers, and account for the documented rectangle-note conversion. The committed reference and integration findings above are the migration handoff.

### Review and fix pass — 2026-10-15 (active)

User requested review/fixes and authorized subagents. Review scope is this library worktree only; no Storyboard writes/migration.

- Confirmed: a pending snapshot import can complete after teardown and retain its source after cleanup already ran.
- Confirmed: asynchronous generation preprocessing and Fal download retries can resume against a replacement session unless the originating signal is retained throughout the operation.
- Confirmed: aborted chat continuation and reused desktop history generation IDs can leak an old transcript into the replacement session.
- Investigating: backup bridge/database ownership after awaits, and public handle availability in a host mount effect.
- Fixes are in progress with focused regressions. Earlier passing evidence remains historical; rerun required checks after the fixes before declaring this pass complete.

### Review repair checkpoint — 2026-10-15

- Fixed and focused-tested pending import cancellation/source release, original native bridge ownership for streamed writes/picker/backup restore, queued autosave cancellation, and backup database namespace capture. Already-started writes can finish on their original bridge; no size limits changed.
- Fixed and focused-tested old generation preprocessing, provider callbacks, download retries and diagnostic logging retaining their originating session. Chat teardown and monotonic history generations prevent old transcript writes/cache updates from entering a new project.
- Fixed synchronous source-acquisition failures leaking earlier checkpoint/writer leases. Public promised snapshot methods now reject errors consistently.
- Added callback-ref readiness guidance + StrictMode mount/teardown regression; no new public readiness API. Corrected installed Python runtime setup/environment instructions.
- Independent consumer now switches project keys/namespaces and rejects old checkpoint tokens. Browser harness uses its installed Vite server on an OS-assigned port, avoiding accidental tests against an unrelated server on port 3101; this updated browser check passed before final repacking.
- In flight: final microphone/recording-conversion and upload/duplicate media cleanup on teardown, followed by all tests, lint/types, packed consumer/upgrade/rollback and desktop build. Storyboard remains untouched.

### Review fixes settled; final verification running — 2026-10-15

- All reviewer edits are frozen. Added bounded cleanup for microphone permission replies, recorder setup failure, stopped-audio conversion, pending uploads and duplicates; shared lazy snapshot URLs remain source-owned. Repeated Stop preserves the first recording instead of cancelling its conversion.
- Review cross-checks found no remaining concrete chat/provider isolation issue after repair. Source lease failure and old-bridge cleanup regressions cover both API and native paths.
- Focused results: provider/generation **454 tests**, persistence **52 tests**, media upload/duplicate **12 tests**, recording **8 tests**, API/readiness **6 tests** passed; targeted types/lint passed before final combined run. These groups overlap the complete suite and should not be added as a total.
- Final `npm test` and `npm run lint` are running. Next: pack/install strict consumer, project-switch browser acceptance, all types, desktop resource build, and final Computer Use acceptance. No live provider/microphone access is needed or claimed.

### Combined verification checkpoint — 2026-10-15

- `npm test` passed all workspaces, including **155 editor suites / 1485 tests**, desktop **193**, Python **149**, Node runtime **18** and web host **3**. Full lint passed. Logs: `/tmp/canva-library-review-all-tests.log`, `/tmp/canva-library-review-lint.log`.
- Final cross-check found two related audio ownership gaps before packing: committed audio URLs were not included in existing history URL cleanup (only video was tracked), and failed waveform uploads retained their pending audio until teardown. Focused fixes/tests are in progress; rerun the editor suite after them, then finish package/browser/types/desktop checks.
- These are cleanup fixes for embedding teardown; no size rejection, media-size limit reduction, or Storyboard work is introduced.

### Review pass complete — 2026-10-15

All concrete review findings were repaired in the Canva Banana worktree. Three reviewers covered session/provider lifecycle, persistence/source ownership, and runtime/delivery; connected fixes were cross-checked before the combined final run. No Storyboard files were modified.

| Final review check | Result/evidence |
| --- | --- |
| All unit/integration tests | `npm test` passed: editor **156 suites / 1489 tests**, desktop **193**, Python **149** (existing Starlette deprecation warning), Node runtime **18** (also through standalone wrapper), web host **3**. `/tmp/canva-library-review-all-tests.log` |
| Lint | `npm run lint` passed. A readiness-test mock component name initially violated hook naming rules; corrected and reran full lint + the readiness regression successfully. `/tmp/canva-library-review-lint.log`, `/tmp/canva-library-review-readiness.log` |
| Public declarations/all types | `npm run typecheck` passed after final runtime edits; independently installed consumer checks declarations with `skipLibCheck: false`. `/tmp/canva-library-review-types.log` |
| Private delivery | `npm run smoke:workspace` passed: tarball contents, independent install, strict typecheck/build, runtime auth/provider mocks/Python resources, synthetic upgrade and rollback. `/tmp/canva-library-review-package.log` |
| Browser regression | `npm run test:consumer` passed, including real project key/namespace switches, stale checkpoint rejection, snapshot round trip and remount. Test server now uses an OS-assigned port. `/tmp/canva-library-review-browser.log` |
| Native resources/build | `npm run build:desktop` passed including final web library build, PyInstaller output and resource verification. `/tmp/canva-library-review-build.log` |
| Computer Use | Final independent packed consumer: load/prompt, PNG export, stream-save, checkpoint restore, switch to B, reject A checkpoint, unmount/remount, explicitly import saved snapshot into fresh B. All visibly passed. Temporary review tab/server closed afterwards. `/tmp/canva-library-review-ui.png` is the repeatable browser acceptance screenshot. |
| Diff hygiene | `git diff --check` passed. Source remains uncommitted on `codex/reusable-workspace-library`. |

Key repairs: originating sessions now own prepared generation, provider retries/events/logs and chat continuations; stale imports release handles; backup listing/pruning/restore and active native writes keep their original bridge/database; queued closed-session writes stop; failed source acquisitions release earlier leases; asynchronous host snapshot methods reject consistently; pending microphone/media operations and audio/video URLs clean up on teardown/failure. Repeated Stop does not discard the original recording. No media byte limits were reduced, and started native streams may finish/abort through their original owner.

Refreshed private artifacts (same uncommitted draft version): `/tmp/canva-banana-workspace-0.2.8.tgz` and `/tmp/canva-banana-runtime-0.2.8.tgz`. README/setup/ready-ref guidance is corrected. No publication, push, or commit was performed.

Known limits remain: React 19 and one workspace per browser window; host-owned native project storage/service lifecycle; Python source requires appropriate runtime/packaging. Released checkpoint-owned playback URLs sweep on the next history update or unmount, so an idle editor can retain that playback buffer until then (documented in the API and code). Live/paid providers, actual microphone capture, physical multi-gigabyte GUI workflows, and full signed/notarized macOS distribution remain unverified. Existing large streaming/range/lease tests pass. Storyboard migration stays outside completion requirements and its saved handoff above remains intact.

### Commit and migration handoff checkpoint — 2026-10-15

User authorized committing the complete reviewed library changes and preparing a copyable prompt for the separate Storyboard migration thread. This plan is included in that library commit on `codex/reusable-workspace-library`; resolve its exact SHA with `git log -1` on this branch. Earlier uncommitted-state notes are historical.

The migration prompt accompanies the commit confirmation in this conversation. It identifies the Storyboard committed-branch baseline, isolated managed worktree requirement, host-owned timeline/accept/reject/credentials/diagnostics/persistence, package setup and APIs, React/native packaging limits, preserved snapshot conversion findings and validation requirements. No Storyboard worktree or migration is created by this commit/handoff task, and nothing is published or pushed.

Validation evidence from the completed review pass above is unchanged; only this plan checkpoint and three whitespace-only staging corrections were added before committing. The complete staged patch passed git diff --cached --check. The private tarballs in `/tmp` are convenience artifacts and may disappear: regenerate from the committed library checkout with `npm ci`, `npm run pack:workspace`, and `npm run pack:runtime` if needed. Pin the final source revision and the artifacts/lockfile in the future host integration.

Read-only handoff preflight confirmed Storyboard `feat/reforacle` is still `645f63538c52f101a4813ad7525a276e4c399f9f`; the original checkout has uncommitted work. The separate migration must use committed branch contents only and leave those edits intact.

### Pull-request delivery checkpoint — 2026-10-15

User authorized pushing the reviewed library branch and creating its GitHub PR. Repository: `jquintanilla4/canva_banana`; base: `dev`; head: `codex/reusable-workspace-library`. The implementation commit is `b9ea29e3cb44aceb8b7626e64b725307d8106664`; this additional delivery checkpoint changes documentation only. Locate the PR by that head branch; the PR link is attached to this Codex task and returned in the conversation after creation. Check the PR's actual CI status before merging rather than treating prior local passes as completed CI.

The local worktree was clean after the implementation commit. Private artifacts were regenerated from that exact source revision. Storyboard's committed reference remains unchanged, its migration stays deferred, and no public npm publication is part of this PR.

### Development desktop Computer Use acceptance — 2026-10-21 (in progress)

User requested native desktop acceptance and authorized one paid image-model call; development mode is explicitly sufficient, so no desktop packaging/build is part of this pass. Source: `960ce8b` / `codex/reusable-workspace-library`. Launch uses this worktree's Vite/shared workspace and extracted Node/Python runtimes, the already-installed matching Electron binary, and disposable `/tmp/canva-library-oct21-profile`. Existing development credentials are passed only in process memory, without writing a new credential file. Storyboard remains untouched and deferred.

Acceptance inventory: empty-canvas disabled actions; model/variant/size/quality/count controls; one GPT Image 2.5 generation (Sunburst, Low, 1024×1024, one image, synthetic robot/banana prompt); queue→rendered media; selection/transform/undo; PNG export; native snapshot save/cancel/reopen with generation metadata; visual fit and native menu operation. Verify the reopened generated image before calling this complete.

Pre-UI desktop tests: **191 passed / 2 failed**, both `package-script-forwarding.test.mjs` assertions expecting npm's echoed package command on stdout. Current host uses npm 12.2.0, which emits `npm notice run ...` on stderr; Forge help exits successfully. This is an output-format assumption in the existing test, not evidence of desktop runtime failure. Do not count this rerun as an all-green suite. Logs: `/tmp/canva-library-oct21-desktop-tests.log`; development service log `/tmp/canva-library-oct21-dev.log` (keep local; may include operational provider details).

Native UI launched successfully. Model/size/quality selectors and prompt enablement visibly passed. One Generate click submitted to Fal; provider is processing generation `01a15da0-578d-7ae0-bb00-5fc209ee17ca`. Do not submit an additional paid generation during this pass.

### Development desktop Computer Use acceptance complete — 2026-10-21

- **PASS:** Native development Electron loads the extracted shared workspace through Vite with the extracted Node/Python services. Empty-canvas Generate/export/edit actions remain disabled until their inputs exist; model menus and dependent controls render and respond.
- **PASS, one live paid request:** Fal GPT Image 2.5 / Sunburst / Low / 1024×1024 / one image completed generation `01a15da0-578d-7ae0-bb00-5fc209ee17ca`, transitioning from Submitting to Processing to Image added to canvas. The orange robot holding a banana visibly rendered. Exact billed cost was not displayed or independently verified. No additional paid request was made.
- **PASS:** Selected the generated image, resized it to 512 px with aspect ratio locked, undid the edit, and reopened Resize to confirm original **1024×1024** dimensions. Cancelling Resize preserved it.
- **PASS:** Native PNG export created a valid **1024×1024 PNG** (844,259 bytes). Native snapshot export cancellation returned to the intact canvas, then successful export created an **848,760-byte** `.bcsnap`. Save dialogs used their default folders/names; those two newly-created QA artifacts were moved to `/tmp` afterward. No existing user files were replaced.
- **PASS:** Deleted only the test image from the disposable canvas, imported the saved snapshot through File → Import Snapshot and the real macOS picker, and observed Snapshot imported with the image restored. Replaced the prompt with temporary QA text, then Metadata to Prompt Bar restored the saved original prompt/model/variant/size/quality. Metadata overlay visibly identifies GPT Image 2.5. Toolbar, native menus, selectors and prompt remain usable in the window.
- **Checks:** Runtime tests **18/18 passed**. Desktop tests **191/193 passed**; the two packaging forwarding checks remain red because npm **12.2.0** writes command notices to stderr, whereas those tests expect stdout. Direct `npm run package:mac -- --help` exits 0 and its stderr contains the correctly forwarded `node scripts/package-mac-app.mjs package --help`; this confirms the output-format discrepancy. No production source/test changes were made for this acceptance request.
- **Evidence:** `/tmp/canva-library-oct21-desktop-reopened.png` (Computer Use screenshot of imported image, snapshot filename and metadata); `/tmp/canva-library-oct21-generated.png`; `/tmp/canva-library-oct21-generated.bcsnap`; `/tmp/canva-library-oct21-desktop-tests.log`; `/tmp/canva-library-oct21-runtime-tests.log`. These are local temporary artifacts and can expire.

Development acceptance covers this image generation/edit/export/snapshot flow. It does not establish all providers, video/audio/microphone, multi-gigabyte GUI performance, or signed/notarized distribution behavior. No desktop packaging build was run, per the user's scope; Vite's normal development prestart regenerated the workspace bundle it consumes. Storyboard migration remains deferred and unchanged. Only this plan is modified in the worktree.

### Desktop test compatibility repair and PR follow-up — 2026-10-21

User authorized fixing the two failing tests, committing the desktop acceptance record, and pushing both to the existing library PR. `package-script-forwarding.test.mjs` now checks the combined stdout/stderr output because npm versions emit script notices on different streams. It still requires successful exit, the correctly forwarded wrapper command/arguments, Forge's mode-specific help, and absence of npm's generic run help. Production code and packaging behavior are unchanged.

Validation: `npm -w @canva-banana/desktop test` passed **34 files / 193 tests** on npm 12.2.0; log `/tmp/canva-library-oct21-desktop-tests-fixed.log`. This supersedes the two failing-check results recorded above. The runtime's **18/18** result and successful live native acceptance remain valid. The isolated desktop app and all three test-owned development listeners were stopped after acceptance. `git diff --check` passed before commit.

Delivery target remains open PR **#32**, `codex/reusable-workspace-library` → `dev`. Its prior-head Checks workflow succeeded; the new push requires its own CI result. This follow-up contains only the test compatibility fix and plan updates. No package build, extra paid request, or Storyboard migration is included.

### Merge current dev and restore PR CI — 2026-10-21 (in progress)

User authorized resolving the PR's conflicts with `dev`, updating this plan, pushing, and checking CI. Storyboard migration remains excluded. Incoming base: `origin/dev` **3c75183bf1b5167688be06759a5591fb0746a13a**; library pre-merge head: **57611177a412a8962e2019253271dd7552bf652b**. A merge (no history rewrite) preserves the existing library commits and test/acceptance records.

Conflicts are dependency-only: root/web manifests and npm lockfile. Resolution preserves the library scripts/package boundaries and carries maintenance updates into their owning packages: React/React DOM in the web host; Google GenAI/zip.js in the shared workspace; tooling/Electron updates in their existing manifests. Regenerated npm lockfile from dev's locked graph with the extracted package manifests. Git automatically carried the incoming FastAPI **0.143.3** and certifi **2026.10.19** updates into the moved `packages/runtime/python/uv.lock`; no duplicate legacy Python tree is reintroduced. Lock regeneration reported zero npm vulnerabilities. Next: clean install, merged dependency checks, commit/push, and observe the new PR CI run. Earlier native paid acceptance is historical evidence for the pre-merge dependency versions; no additional paid request is planned.

### Merge resolution validated locally — 2026-10-21

All conflicts are resolved; incoming maintenance versions and the extracted package layout are preserved. Clean `npm ci` succeeded with zero reported vulnerabilities. `npm test` passed: editor **156 files / 1489 tests**, desktop **193**, Python **149**, runtime **18** (also through wrapper), web host **3**. Full lint, all types, web production build, independently installed package/type/build/runtime smoke, synthetic artifact upgrade/rollback, and independent Playwright consumer acceptance all passed. Logs: `/tmp/canva-library-dev-merge-{install,tests,lint,types,build,package,browser}.log`.

The merged package smoke initially exposed another npm 12 JSON-format difference: `npm pack --json` returns an object keyed by package name instead of the older array. Both initial and upgrade pack-result reads now use `Object.values`, accepting either shape without changing package contents or runtime behavior. The real npm 12 smoke/upgrade/rollback passed after repair; an assert-based check verified both JSON shapes and `node --check` passed. No extra abstraction or dependency was added. Non-blocking existing warnings remain (jsdom canvas, Starlette deprecation, Vite chunk sizes).

The merge and this record are ready to commit/push to PR #32. CI must run against the resulting merge commit; its live status is authoritative at [PR #32](https://github.com/jquintanilla4/canva_banana/pull/32). Local packaging/signing was not repeated, and no additional paid provider or native UI session was run after the dependency merge; the full macOS packaging job is included in PR CI. Storyboard files, worktrees, and migration remain outside scope.
