import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const normalizeModuleId = (id: string): string => id.replaceAll('\\', '/'); // Rollup ids can use platform separators.

const defineOptionalString = (value: string | undefined): string => (
  value === undefined ? 'undefined' : JSON.stringify(value)
); // Vite define values must be JavaScript expression strings.

const getManualChunk = (id: string): string | undefined => {
  const normalizedId = normalizeModuleId(id);
  if (!normalizedId.includes('/node_modules/')) {
    return undefined; // App code stays in route-level chunks.
  }
  if (normalizedId.includes('/node_modules/react/') || normalizedId.includes('/node_modules/react-dom/')) {
    return 'vendor-react'; // Keep the React runtime cached separately.
  }
  if (normalizedId.includes('/node_modules/react-icons/')) {
    return 'vendor-icons'; // Icon packs are large and rarely change.
  }
  if (normalizedId.includes('/node_modules/@fal-ai/')) {
    return 'vendor-fal'; // Fal SDK code is provider-specific.
  }
  if (normalizedId.includes('/node_modules/@google/genai/')) {
    return 'vendor-google'; // Gemini SDK code is provider-specific.
  }
  return 'vendor'; // Remaining shared dependencies go in a stable vendor chunk.
};

export default defineConfig(({ mode }) => {
    const repoRoot = path.resolve(__dirname, '../..');
    const env = loadEnv(mode, repoRoot, '');
    const isDesktopPackageBuild = process.env.CANVA_BANANA_DESKTOP_PACKAGE === '1'; // Desktop keys come from IPC settings.
    return {
      base: './', // Keep packaged Electron file:// assets relative to index.html.
      server: {
        port: 3000,
        strictPort: true, // Electron always opens this exact dev URL.
        host: '0.0.0.0',
      },
      plugins: [react(), tailwindcss()],
      define: {
        'process.env.API_KEY': defineOptionalString(isDesktopPackageBuild ? undefined : env.GEMINI_API_KEY),
        'process.env.GEMINI_API_KEY': defineOptionalString(isDesktopPackageBuild ? undefined : env.GEMINI_API_KEY),
        'process.env.SECURE_BACKEND_API_BASE_URL': JSON.stringify(env.SECURE_BACKEND_API_BASE_URL),
        'process.env.FAL_API_URL': JSON.stringify(env.FAL_API_URL),
        'process.env.FAL_MODEL_ID': JSON.stringify(env.FAL_MODEL_ID),
        'process.env.VOLCENGINE_API_BASE_URL': JSON.stringify(env.VOLCENGINE_API_BASE_URL),
        'process.env.JIMENG_API_BASE_URL': JSON.stringify(env.JIMENG_API_BASE_URL),
      },
      build: {
        rollupOptions: {
          output: {
            manualChunks: getManualChunk,
          },
        },
      },
      test: {
        environment: 'jsdom',
        setupFiles: ['./test/setup.ts'],
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
