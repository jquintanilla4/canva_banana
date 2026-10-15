# Private Canva Banana provider runtime

Install the matching `@canva-banana/runtime` tarball into a trusted Node/Electron host. The browser library calls these HTTP services; provider implementations are not copied into a consuming app's renderer. Importing this package does not start a server or load `.env` files.

```js
import { createSecureBackendServer, pythonBackendSourcePath } from '@canva-banana/runtime';

const server = createSecureBackendServer({
  env: {
    FAL_API_KEY: process.env.FAL_API_KEY,
    OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY,
    MOONSHOT_API_KEY: process.env.MOONSHOT_API_KEY,
    SECURE_BACKEND_ALLOWED_ORIGINS: 'https://your-app.example',
  },
});
server.listen(8787, '127.0.0.1');
console.log(pythonBackendSourcePath);
```

Use the host's existing authentication/secret storage and explicit allowed origins. The local desktop token contract is preserved (`CANVA_BANANA_DESKTOP_AUTH_TOKEN`, sent in `x-canva-banana-desktop-token`); it protects desktop-origin key-bearing requests. It is not a substitute for user authentication in a public multi-user server. The host owns server start/stop and graceful shutdown. The tested Node development version is 24.

| Features | Required runtime/configuration |
| --- | --- |
| Fal image/video models, uploads and asset fetching | This Node server, `FAL_API_KEY`, and the browser `secureBackendApiBaseUrl`/optional proxy override. Supported model changes travel with the shared renderer/provider code. |
| Prompt chat | Node server plus `OPENROUTER_API_KEY`. |
| HeyGen timing intent assistance | Node server plus `MOONSHOT_API_KEY`. |
| Gemini | Browser library's explicit `geminiApiKey`/`apiKey` configuration (user-supplied key); the Node proxy does not currently proxy Gemini. |
| Volcengine/Jimeng | Included Python HTTP service, corresponding credentials/CLI setup, and explicit `volcengineApiBaseUrl`/`jimengApiBaseUrl`. |

The package includes `python/src`, `python/pyproject.toml`, `python/uv.lock`, and its README. `pythonBackendSourcePath` points to that installed project, independent of a source checkout. Run `uv sync --project <that-path>` and launch `uv run --project <that-path> uvicorn uvpython_service.main:app --app-dir <that-path>/src --host 127.0.0.1 --port 8000` when using source-based local services. Python requires 3.12 or newer. Supply environment values directly, or set `CANVA_BANANA_ENV_DIR` to a host-owned directory; shell values take precedence. Configure `JIMENG_WORK_DIR` explicitly for per-project working data.

For a packaged Electron app, build/bundle the Python service for the target platform, configure its resources and host process lifecycle, and provide its actual URL/auth origin/token to the renderer. The npm artifact contains source, not a prebuilt Python executable. Canva Banana's existing `apps/python-backend` build command and desktop resource preparation show the supported PyInstaller setup and preserve its existing packaged layout. Jimeng CLI/login and ffprobe/runtime requirements still apply; installing an npm tarball does not perform those setup steps.

Private updates should pin matching UI/runtime artifacts and preserve the consumer's lockfile. Python source/lock changes travel with the runtime artifact; rebuild any bundled native executable on runtime upgrades. Unsupported or unconfigured services must surface their existing setup/errors rather than silently claiming availability.
