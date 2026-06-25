import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const currentFilePath = fileURLToPath(import.meta.url);
const scriptsDir = dirname(currentFilePath);
const desktopDir = resolve(scriptsDir, '..');

const requiredPackageResources = [
  resolve(desktopDir, 'resources/web/index.html'),
  resolve(desktopDir, 'resources/python-backend/canva-banana-python-backend'),
  resolve(desktopDir, 'generated/secure-backend/server.mjs'),
]; // These files are required by packaged Electron startup paths.

const missingResources = requiredPackageResources.filter(resourcePath => !existsSync(resourcePath)); // Report every missing artifact at once.

if (missingResources.length > 0) {
  console.error('Desktop package resources are missing:');
  for (const resourcePath of missingResources) {
    console.error(`- ${resourcePath}`);
  }
  process.exit(1);
}
