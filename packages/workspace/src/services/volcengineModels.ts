import type { Seedance2VolcengineModel } from '../types';

export type VolcengineResolution = '480p' | '720p' | '1080p' | '4k';

type VolcengineModelCapabilities = {
  value: Seedance2VolcengineModel;
  id: string;
  label: string;
  maxDurationSeconds: 15 | 30;
  resolutions: readonly VolcengineResolution[];
  referenceLimits: { images: number; videos: number; audios: number };
  supportsOutputFormat: boolean;
  supportsDraft: boolean;
  provider: 'volcengine' | 'tokenhub';
  supportsAutoDuration: boolean;
  editUsesSourceDuration: boolean;
  family: '2.0' | '2.5';
};

const basicResolutions: readonly VolcengineResolution[] = ['480p', '720p'];
const tokenHubResolutions: readonly VolcengineResolution[] = [...basicResolutions, '1080p'];
const fullResolutions: readonly VolcengineResolution[] = [...tokenHubResolutions, '4k'];
const ark = { provider: 'volcengine', supportsAutoDuration: true } as const;
const seedance20 = {
  ...ark,
  maxDurationSeconds: 15,
  resolutions: basicResolutions,
  referenceLimits: { images: 9, videos: 3, audios: 3 },
  supportsOutputFormat: false,
  supportsDraft: false,
  editUsesSourceDuration: false,
  family: '2.0',
} satisfies Omit<VolcengineModelCapabilities, 'value' | 'id' | 'label'>;
const seedance25 = {
  ...ark,
  maxDurationSeconds: 30,
  supportsOutputFormat: true,
  editUsesSourceDuration: true,
  family: '2.5',
} as const;
const tokenHub = {
  provider: 'tokenhub',
  resolutions: tokenHubResolutions,
  supportsDraft: false,
  supportsOutputFormat: false,
  supportsAutoDuration: false,
  editUsesSourceDuration: true,
} as const;
const seedance25ReferenceLimits = { images: 30, videos: 10, audios: 10 };

const models: Record<Seedance2VolcengineModel, VolcengineModelCapabilities> = {
  standard: { ...seedance20, value: 'standard', id: 'doubao-seedance-2-0-260128', label: 'Seedance 2.0', resolutions: fullResolutions },
  fast: { ...seedance20, value: 'fast', id: 'doubao-seedance-2-0-fast-260128', label: 'Seedance 2.0 Fast' },
  mini: { ...seedance20, value: 'mini', id: 'doubao-seedance-2-0-mini-260615', label: 'Seedance 2.0 Mini' },
  seedance25: {
    ...seedance25,
    value: 'seedance25',
    id: 'doubao-seedance-2-5-260628',
    label: 'Seedance 2.5',
    resolutions: fullResolutions,
    referenceLimits: seedance25ReferenceLimits,
    supportsDraft: true,
  },
  seedance25Flash: {
    ...seedance25,
    value: 'seedance25Flash',
    id: 'doubao-seedance-2-5-flash-261115',
    label: 'Seedance 2.5 Flash',
    resolutions: basicResolutions,
    referenceLimits: { images: 10, videos: 5, audios: 5 },
    supportsDraft: false,
  },
  tokenhub20: {
    ...seedance20,
    ...tokenHub,
    value: 'tokenhub20',
    id: 'doubao-seedance-2-0-os-standard',
    label: 'Seedance 2.0 (TokenHub)',
  },
  tokenhub25: {
    ...seedance25,
    ...tokenHub,
    value: 'tokenhub25',
    id: 'doubao-seedance-2-5-os-standard',
    label: 'Seedance 2.5 (TokenHub)',
    referenceLimits: seedance25ReferenceLimits,
  },
};

export const getSeedance2VolcengineModelCapabilities = (model?: Seedance2VolcengineModel) => models[model ?? 'standard'];

export const isTokenHubSeedanceModelId = (id: string) => id === models.tokenhub20.id || id === models.tokenhub25.id;

export const isSeedance2VolcengineModel = (value: unknown): value is Seedance2VolcengineModel =>
  typeof value === 'string' && Object.hasOwn(models, value);

export const SEEDANCE2_VOLCENGINE_MODEL_OPTIONS = Object.values(models).map(model => ({
  value: model.value,
  label: model.provider === 'tokenhub' ? `Seedance ${model.family}` : model.label,
  provider: model.provider,
  tooltip: `${model.label} supports ${model.resolutions.join(', ')} and up to ${model.maxDurationSeconds}s.`,
}));
