export * from './node/server.mjs';
import { fileURLToPath } from 'node:url';

export const pythonBackendSourcePath = fileURLToPath(new URL('./python', import.meta.url));
