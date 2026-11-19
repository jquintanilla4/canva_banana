# Private Canva Banana provider runtime

Install the matching `@canva-banana/runtime` tarball into a trusted Node/Electron host. The browser library calls these HTTP services; provider implementations are not copied into a consuming app's renderer. Importing this package does not start a server or load `.env` files.

```js
import { createSecureBackendServer, pythonBackendSourcePath } from '@canva-banana/runtime';

const server = createSecureBackendServer({
  env: {
    FAL_API_KEY: process.env.FAL_API_KEY,
    OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY,
    MOONSHOT_API_KEY: process.env.MOONSHOT_API_KEY,
    TOKENHUB_API_KEY: process.env.TOKENHUB_API_KEY,
    TOKENHUB_BASE_URL: process.env.TOKENHUB_BASE_URL,
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
| TokenHub GPT Image 2.5 and NanoBanana 2.1 generation and edits | Node server and `TOKENHUB_API_KEY`. Set `TOKENHUB_BASE_URL` to override `https://tokenhub.ctclouds.com/v1`. |
| HeyGen timing intent assistance | Node server plus `MOONSHOT_API_KEY`. |
| Gemini | Browser library's explicit `geminiApiKey`/`apiKey` configuration (user-supplied key); the Node proxy does not currently proxy Gemini. |
| Volcengine/Jimeng | Included Python HTTP service, corresponding credentials/CLI setup, and explicit `volcengineApiBaseUrl`/`jimengApiBaseUrl`. |

TokenHub uses `POST /api/tokenhub/images/generations` for text-to-image and `POST /api/tokenhub/images/edits` for edits. Both routes return an Images API result with a `data` array of base64 images.

Text-to-image requests have a 1 MiB body limit. Each backend instance accepts one edit at a time and returns HTTP 429 for additional edit requests while that edit runs. When setting a custom TokenHub base URL, include any gateway path prefix. A bare origin uses `/v1`.

- GPT Image 2.5 supports `og-image-2-5-flare-standard` and `og-image-2-5-sunburst-standard` and accepts OpenAI image-generation fields. Edits add an `images` array of data URLs and an optional PNG `markup` data URL.
- NanoBanana 2.1 supports `gg-nano-banana-2-1-standard` and accepts `prompt`, optional `aspect_ratio`, `resolution` (1K, 2K, or 4K), `enable_web_search`, `thinking_level` (minimal, medium, or high), and `n` (1–4). Edits also require an ordered `images` array of data URLs. The backend requests PNG output through the Google GenAI SDK and sends the request to the TokenHub Images API.

The package includes `python/src`, `python/pyproject.toml`, `python/uv.lock`, and its README. `pythonBackendSourcePath` points to that installed project, independent of a source checkout. Run `uv sync --project <that-path>` and launch `uv run --project <that-path> uvicorn uvpython_service.main:app --app-dir <that-path>/src --host 127.0.0.1 --port 8000` when using source-based local services. Python requires 3.12 or newer. Supply environment values directly, or set `CANVA_BANANA_ENV_DIR` to a host-owned directory; shell values take precedence. Configure `JIMENG_WORK_DIR` explicitly for per-project working data.

For a packaged Electron app, build/bundle the Python service for the target platform, configure its resources and host process lifecycle, and provide its actual URL/auth origin/token to the renderer. The npm artifact contains source, not a prebuilt Python executable. Canva Banana's existing `apps/python-backend` build command and desktop resource preparation show the supported PyInstaller setup and preserve its existing packaged layout. Jimeng CLI/login and ffprobe/runtime requirements still apply; installing an npm tarball does not perform those setup steps.

Private updates should pin matching UI/runtime artifacts and preserve the consumer's lockfile. Python source/lock changes travel with the runtime artifact; rebuild any bundled native executable on runtime upgrades. Unsupported or unconfigured services must surface their existing setup/errors rather than silently claiming availability.
