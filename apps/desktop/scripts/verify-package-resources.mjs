import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getRequiredAppIconResourcePaths } from '../app-icon-store.mjs';
import { BUILD_VARIANT_FILE_NAME, parseBuildVariantMetadata } from '../build-variant.mjs';

const currentFilePath = fileURLToPath(import.meta.url);
const scriptsDir = dirname(currentFilePath);
const desktopDir = resolve(scriptsDir, '..');

export const getRequiredPackageResources = (targetDesktopDir = desktopDir) => [
  resolve(targetDesktopDir, 'resources/web/index.html'),
  resolve(targetDesktopDir, 'resources/python-backend/canva-banana-python-backend'),
  resolve(targetDesktopDir, 'generated/secure-backend/server.mjs'),
  resolve(targetDesktopDir, 'generated', BUILD_VARIANT_FILE_NAME),
  ...getRequiredAppIconResourcePaths(targetDesktopDir),
]; // These files are required by packaged Electron startup paths.

export const findMissingPackageResources = (targetDesktopDir = desktopDir) => (
  getRequiredPackageResources(targetDesktopDir).filter(resourcePath => !existsSync(resourcePath))
); // Report every missing artifact at once.

export const verifyPackageResources = (targetDesktopDir = desktopDir) => {
  const missingResources = findMissingPackageResources(targetDesktopDir);
  if (missingResources.length > 0) {
    throw new Error(`Desktop package resources are missing:\n${missingResources.map(resourcePath => `- ${resourcePath}`).join('\n')}`);
  }
  const metadataPath = resolve(targetDesktopDir, 'generated', BUILD_VARIANT_FILE_NAME);
  try {
    parseBuildVariantMetadata(JSON.parse(readFileSync(metadataPath, 'utf8')));
  } catch (error) {
    throw new Error(`Desktop build metadata is invalid: ${error instanceof Error ? error.message : String(error)}`);
  }
};

if (process.argv[1] && resolve(process.argv[1]) === currentFilePath) {
  try {
    verifyPackageResources();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
