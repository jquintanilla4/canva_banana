import type { Seedance2Variant, Seedance2VolcengineModel } from '../types';
import { getSeedance2VolcengineModelCapabilities } from './volcengineModels';

export type VolcengineAssetReference = { mediaType: 'image' | 'video' | 'audio'; assetId: string };
export type VolcengineAssetMention = VolcengineAssetReference & { mention: string };

export type VolcengineReferenceSource = VolcengineAssetReference & { kind: 'asset' }
  | { kind: 'upload'; mediaType: VolcengineAssetReference['mediaType']; index: number };

export type VolcengineSettings = {
  draft?: boolean;
  webSearch?: boolean;
  returnLastFrame?: boolean;
  watermark?: boolean;
  priority?: number;
  assets?: VolcengineAssetReference[];
};

export type VolcengineFinalResolution = '1080p' | '4k';

export type VolcengineFinalization = { kind: 'submitting'; restoredRequestId?: string }
  | { kind: 'rejected'; requestId?: string }
  | { kind: 'submitted'; requestId: string }
  | { kind: 'completed'; requestId: string };

export type VolcengineDraft = {
  requestId: string;
  expiresAt: number;
  finalizations?: Partial<Record<VolcengineFinalResolution, VolcengineFinalization>>;
};

export const isArkIdentifier = (value: unknown): value is string =>
  typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9_-]{0,255}$/.test(value);

export const normalizeArkAssetId = (value: unknown): string | undefined => {
  if (typeof value !== 'string') return undefined;
  const id = value.trim().replace(/^asset:\/\//, '');
  return isArkIdentifier(id) ? id : undefined;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isIntegerInRange = (value: unknown, min: number, max: number): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max;

export const getVolcengineAssetMediaTypes = (
  model: Seedance2VolcengineModel | undefined,
  variant: Seedance2Variant,
): readonly VolcengineAssetReference['mediaType'][] => {
  if (variant === 'smart') return [];
  if (variant !== 'extend') return ['image', 'video', 'audio'];
  return getSeedance2VolcengineModelCapabilities(model).family === '2.5' ? ['image', 'video'] : ['video'];
};

export const normalizeVolcengineSettings = (value: unknown): VolcengineSettings => {
  if (!isRecord(value)) return {};
  const settings: VolcengineSettings = {};
  for (const key of ['draft', 'webSearch', 'returnLastFrame', 'watermark'] as const) {
    if (value[key] === true) settings[key] = true;
  }
  if (isIntegerInRange(value.priority, 0, 9)) settings.priority = value.priority;
  if (Array.isArray(value.assets)) {
    const assets: VolcengineAssetReference[] = [];
    for (const entry of value.assets) {
      if (!isRecord(entry)) continue;
      const { mediaType } = entry;
      const assetId = normalizeArkAssetId(entry.assetId);
      if (assetId && (mediaType === 'image' || mediaType === 'video' || mediaType === 'audio')) {
        assets.push({ mediaType, assetId });
      }
    }
    if (assets.length) settings.assets = assets;
  }
  return settings;
};

export const getActiveVolcengineSettings = (
  model: Seedance2VolcengineModel | undefined,
  variant: Seedance2Variant,
  value: unknown,
): VolcengineSettings => {
  const settings = normalizeVolcengineSettings(value);
  if (!getSeedance2VolcengineModelCapabilities(model).supportsDraft) delete settings.draft;
  if (settings.assets) {
    const mediaTypes = getVolcengineAssetMediaTypes(model, variant);
    settings.assets = settings.assets.filter(asset => mediaTypes.includes(asset.mediaType));
    if (!settings.assets.length) delete settings.assets;
  }
  return settings;
};

export const getVolcengineAssetCounts = (assets: readonly VolcengineAssetReference[] = []) => {
  const counts = { image: 0, video: 0, audio: 0 };
  for (const asset of assets) counts[asset.mediaType] += 1;
  return counts;
};

export const getVolcengineAssetMentions = (
  assets: readonly VolcengineAssetReference[] = [],
  uploaded: { image: number; video: number; audio: number },
): VolcengineAssetMention[] => {
  const counts = { ...uploaded };
  const labels = { image: 'Image', video: 'Video', audio: 'Audio' };
  return assets.map(asset => ({ ...asset, mention: `@${labels[asset.mediaType]}${++counts[asset.mediaType]}` }));
};

export const normalizeVolcengineDraft = (value: unknown): VolcengineDraft | undefined => {
  if (!isRecord(value) || typeof value.requestId !== 'string' || !value.requestId
    || !isIntegerInRange(value.expiresAt, 1, Number.MAX_SAFE_INTEGER)) return undefined;
  const draft: VolcengineDraft = { requestId: value.requestId, expiresAt: value.expiresAt };
  if (isRecord(value.finalizations)) {
    const finalizations: NonNullable<VolcengineDraft['finalizations']> = {};
    for (const resolution of ['1080p', '4k'] as const) {
      const task = value.finalizations[resolution];
      if (!isRecord(task)) continue;
      if (task.kind === 'submitting') {
        finalizations[resolution] = {
          kind: task.kind,
          ...(isArkIdentifier(task.restoredRequestId) ? { restoredRequestId: task.restoredRequestId } : {}),
        };
      }
      if (task.kind === 'rejected') {
        finalizations[resolution] = { kind: task.kind, ...(isArkIdentifier(task.requestId) ? { requestId: task.requestId } : {}) };
      }
      if ((task.kind === 'submitted' || task.kind === 'completed') && typeof task.requestId === 'string' && task.requestId) {
        finalizations[resolution] = { kind: task.kind, requestId: task.requestId };
      }
    }
    if (Object.keys(finalizations).length) draft.finalizations = finalizations;
  }
  return draft;
};

export const buildVolcengineReferenceSources = (
  files: { image: number; video: number; audio: number },
  assets: readonly VolcengineAssetReference[],
): VolcengineReferenceSource[] => {
  const sources: VolcengineReferenceSource[] = [];
  for (const mediaType of ['image', 'video', 'audio'] as const) {
    for (let index = 0; index < files[mediaType]; index += 1) sources.push({ kind: 'upload', mediaType, index });
    for (const asset of assets) {
      if (asset.mediaType === mediaType) sources.push({ kind: 'asset', ...asset });
    }
  }
  return sources;
};
