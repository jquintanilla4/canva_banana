import type { RuntimeConfig } from '@canva-banana/workspace';

export const runtimeConfig: Partial<RuntimeConfig> = {
  apiKey: process.env.API_KEY,
  geminiApiKey: process.env.GEMINI_API_KEY,
  secureBackendApiBaseUrl: process.env.SECURE_BACKEND_API_BASE_URL,
  falApiUrl: process.env.FAL_API_URL,
  falModelId: process.env.FAL_MODEL_ID,
  volcengineApiBaseUrl: process.env.VOLCENGINE_API_BASE_URL,
  jimengApiBaseUrl: process.env.JIMENG_API_BASE_URL,
}; // Environment loading belongs to the standalone host, never the reusable package.
