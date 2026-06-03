import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      plugins: [react()],
      define: {
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.SECURE_BACKEND_API_BASE_URL': JSON.stringify(env.SECURE_BACKEND_API_BASE_URL),
        'process.env.FAL_API_URL': JSON.stringify(env.FAL_API_URL),
        'process.env.FAL_MODEL_ID': JSON.stringify(env.FAL_MODEL_ID),
        'process.env.VOLCENGINE_API_BASE_URL': JSON.stringify(env.VOLCENGINE_API_BASE_URL),
        'process.env.JIMENG_API_BASE_URL': JSON.stringify(env.JIMENG_API_BASE_URL),
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
