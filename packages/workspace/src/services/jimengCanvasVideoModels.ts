import type { GenerationInputs } from '../types';
import type { JimengCanvasModel } from './jimengCanvasService';

export const JIMENG_CANVAS_VIDEO_CATALOG_PENDING = 'Checking Jimeng Canvas model availability…';

const JIMENG_CANVAS_VIDEO_MODELS = {
  'seedance2.0fast_vip': 'seedance_2.0_fast_vip',
  'seedance2.0_vip': 'seedance_2.0_vip',
  'seedance2.0mini': 'seedance_2.0_mini',
  'seedance2.5': 'seedance_2.5',
} as const;

export type ResolveJimengCanvasVideoModel = (version: string | undefined) => string | null | undefined;

const normalizeModelIdentity = (value: string): string => value.toLowerCase().replace(/[\s\p{P}]/gu, '');

const modelIdentities = [
  { version: 'seedance2.0', aliases: ['seedance20', 'seedance20standard'] },
  { version: 'seedance2.0fast', aliases: ['seedance20fast', 'seedance20standardfast'] },
  { version: 'seedance2.0_vip', aliases: ['seedance20vip'] },
  { version: 'seedance2.0fast_vip', aliases: ['seedance20fastvip', 'seedance20vipfast'] },
  { version: 'seedance2.0mini', aliases: ['seedance20mini'] },
  { version: 'seedance2.5', aliases: ['seedance25'] },
];

const getModelIdentity = (value: string): string | undefined => {
  const normalized = normalizeModelIdentity(value);
  return modelIdentities.find(identity => identity.aliases.includes(normalized))?.version;
};

export const isJimengCanvasVideoModelId = (value: unknown): value is string =>
  typeof value === 'string' && value.length <= 256 && /^[a-z0-9]/i.test(value) && !/[^a-z0-9._-]/i.test(value);

export const getJimengCanvasVideoModel = (
  version: string | undefined,
  catalog: readonly JimengCanvasModel[] | undefined,
): string | null | undefined => {
  const verifiedModel = Object.entries(JIMENG_CANVAS_VIDEO_MODELS).find(([classicVersion]) => version === classicVersion)?.[1];
  if (verifiedModel) return verifiedModel;
  if (version !== 'seedance2.0' && version !== 'seedance2.0fast') return undefined;
  if (catalog === undefined) return null;
  const matches = catalog.filter(model => {
    if (model.type !== 'video' || !isJimengCanvasVideoModelId(model.model)) return false;
    const identities = [model.model, ...model.aliases].map(getModelIdentity).filter(identity => identity !== undefined);
    return identities.includes(version) && identities.every(identity => identity === version);
  });
  const match = matches.length === 1 ? matches[0] : undefined;
  if (!match || catalog.filter(model => model.type === 'video' && model.model === match.model).length !== 1) return undefined;
  return match.model;
};

export const getSavedJimengCanvasVideoModel = (generation: GenerationInputs | undefined): string | undefined => {
  const model = generation?.jimengOptions?.canvasModel;
  return isJimengCanvasVideoModelId(model) ? model : undefined;
};
