import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { scopeWorkspaceCss } from './scopeCss.ts';

export default defineConfig({
  plugins: [react(), tailwindcss(), {
    name: 'scope-workspace-css', enforce: 'post',
    generateBundle(_options, bundle) {
      this.emitFile({ type: 'asset', fileName: 'style.css.d.ts', source: 'export {};\n' });
      for (const asset of Object.values(bundle)) {
        if (asset.type === 'asset' && asset.fileName.endsWith('.css')) {
          asset.source = scopeWorkspaceCss(String(asset.source));
        }
      }
    },
  }],
  build: {
    lib: { entry: 'src/index.ts', formats: ['es'], fileName: 'workspace', cssFileName: 'style' },
    rolldownOptions: { external: ['react', 'react-dom', 'react/jsx-runtime', 'react/jsx-dev-runtime', 'react-dom/client'] },
  },
  test: { environment: 'jsdom', setupFiles: ['./src/test/setup.ts'] },
});
