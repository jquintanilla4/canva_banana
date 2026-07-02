import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';

export const APP_ICON_RESOURCE_DIR_NAME = 'app-icons';
export const DEFAULT_APP_ICON_ID = 'monalisa-bionic';

export const APP_ICON_OPTIONS = Object.freeze([
  Object.freeze({
    id: DEFAULT_APP_ICON_ID,
    label: 'Mona Lisa',
    description: 'Bionic portrait',
    previewAssetSegments: Object.freeze(['monalisa-bionic-icon-preview.png']),
    dockAssetSegments: Object.freeze(['monalisa-bionic-icon-1024.png']),
    previewResourceFile: 'monalisa-bionic-preview.png',
    dockResourceFile: 'monalisa-bionic-dock.png',
  }),
  Object.freeze({
    id: 'institute', // Keep the original icon available as an alternate.
    label: 'The Institute',
    description: 'Original icon',
    previewAssetSegments: Object.freeze(['institute-icon-preview.png']),
    dockAssetSegments: Object.freeze(['icon-1024.png']),
    previewResourceFile: 'institute-preview.png',
    dockResourceFile: 'institute-dock.png',
  }),
]);

const knownAppIconIds = new Set(APP_ICON_OPTIONS.map(option => option.id)); // Registry ids are the only persisted values allowed.

export const normalizeAppIconId = value => (
  typeof value === 'string' && knownAppIconIds.has(value) ? value : DEFAULT_APP_ICON_ID
);

export const assertKnownAppIconId = value => {
  if (typeof value !== 'string' || !knownAppIconIds.has(value)) {
    throw new Error('Unknown app icon.');
  }
  return value;
};

export const getAppIconPreferencePath = userDataDir => join(userDataDir, 'app-icon.json');

export const readSelectedAppIconId = async preferencePath => {
  if (!existsSync(preferencePath)) {
    return DEFAULT_APP_ICON_ID; // First launch uses the bundled default icon.
  }
  try {
    const content = await readFile(preferencePath, 'utf8');
    const parsed = JSON.parse(content);
    return normalizeAppIconId(parsed?.selectedIconId);
  } catch {
    return DEFAULT_APP_ICON_ID; // Bad preference files should not block desktop startup.
  }
};

export const writeSelectedAppIconId = async (preferencePath, iconId) => {
  const selectedIconId = assertKnownAppIconId(iconId);
  const payload = `${JSON.stringify({ selectedIconId }, null, 2)}\n`;
  const tempPath = join(dirname(preferencePath), `.app-icon.${randomBytes(6).toString('hex')}.tmp`); // Same directory keeps rename atomic.
  await mkdir(dirname(preferencePath), { recursive: true });
  try {
    await writeFile(tempPath, payload);
    await rename(tempPath, preferencePath);
  } catch (error) {
    await rm(tempPath, { force: true });
    throw error;
  }
  return selectedIconId;
};

export const resolveAppIconPath = (option, kind, { isPackaged, resourcesPath, desktopDir }) => {
  if (isPackaged) {
    const resourceFile = kind === 'preview' ? option.previewResourceFile : option.dockResourceFile;
    return join(resourcesPath, APP_ICON_RESOURCE_DIR_NAME, resourceFile);
  }
  const assetSegments = kind === 'preview' ? option.previewAssetSegments : option.dockAssetSegments;
  return join(desktopDir, 'assets', ...assetSegments);
};

export const getRuntimeAppIconOptions = runtimeContext => APP_ICON_OPTIONS.map(option => ({
  ...option,
  previewPath: resolveAppIconPath(option, 'preview', runtimeContext),
  dockIconPath: resolveAppIconPath(option, 'dock', runtimeContext),
}));

const readPreviewDataUrl = async previewPath => {
  const image = await readFile(previewPath);
  const mimeType = basename(previewPath).toLowerCase().endsWith('.png') ? 'image/png' : 'application/octet-stream';
  return `data:${mimeType};base64,${image.toString('base64')}`;
};

export const buildAppIconState = async ({ selectedIconId, supportsDockIcon, runtimeContext }) => {
  const runtimeOptions = getRuntimeAppIconOptions(runtimeContext);
  const options = await Promise.all(runtimeOptions.map(async option => ({
    id: option.id,
    label: option.label,
    description: option.description,
    previewDataUrl: await readPreviewDataUrl(option.previewPath),
  })));
  return {
    selectedIconId: normalizeAppIconId(selectedIconId),
    options,
    supportsDockIcon,
  };
};

export const getAppIconResourceSpecs = desktopDir => APP_ICON_OPTIONS.flatMap(option => [
  {
    sourcePath: join(desktopDir, 'assets', ...option.previewAssetSegments),
    resourceFileName: option.previewResourceFile,
  },
  {
    sourcePath: join(desktopDir, 'assets', ...option.dockAssetSegments),
    resourceFileName: option.dockResourceFile,
  },
]);

export const getRequiredAppIconResourcePaths = desktopDir => getAppIconResourceSpecs(desktopDir).map(spec => (
  join(desktopDir, 'resources', APP_ICON_RESOURCE_DIR_NAME, spec.resourceFileName)
));
