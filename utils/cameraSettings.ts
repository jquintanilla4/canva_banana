export type CameraBodyOption = {
  id: 'imax-camera' | 'arriflex-16sr3' | 'red-v-raptor';
  label: string;
  description: string;
  promptLabel: string;
};

export type LensFamilyOption = {
  id: 'hawk-v-lite' | 'panavision-c-series' | 'canon-k35';
  label: string;
  tag?: string;
  description: string;
  promptLabel: string;
};

export type FocalLengthOption = {
  id: '14mm' | '24mm' | '35mm' | '50mm' | '85mm' | '100mm' | '135mm' | '180mm';
  label: string;
  tStop?: string;
};

export interface CameraSettingsSelection {
  cameraId: CameraBodyOption['id'] | null;
  lensId: LensFamilyOption['id'] | null;
  focalLengthIds: FocalLengthOption['id'][];
}

export const CAMERA_BODIES: ReadonlyArray<CameraBodyOption> = [
  {
    id: 'imax-camera',
    label: 'IMAX Camera',
    description: '70mm format, 15-perf, grainy shallow DoF',
    promptLabel: 'IMAX Camera',
  },
  {
    id: 'arriflex-16sr3',
    label: 'Arriflex 16SR',
    description: 'Super 16mm format, retro cinematic look',
    promptLabel: 'Arriflex 16SR',
  },
  {
    id: 'red-v-raptor',
    label: 'RED V-Raptor',
    description: '8K, 40.95mm x 21.6mm sensor, clean shallow DoF',
    promptLabel: 'RED V-Raptor',
  },
];

export const LENS_FAMILIES: ReadonlyArray<LensFamilyOption> = [
  {
    id: 'hawk-v-lite',
    label: 'Hawk V-Lite',
    tag: 'Anamorphic',
    description: 'Vintage 70s look, 2x squeeze',
    promptLabel: 'Hawk V-Lite anamorphic lens',
  },
  {
    id: 'panavision-c-series',
    label: 'Panavision C-Series',
    tag: 'Anamorphic',
    description: 'Classic Hollywood aesthetic',
    promptLabel: 'Panavision C-Series anamorphic lens',
  },
  {
    id: 'canon-k35',
    label: 'Canon K35',
    tag: 'Spherical',
    description: 'Fast vintage primes, soft contrast',
    promptLabel: 'Canon K35 spherical lens',
  },
];

export const FOCAL_LENGTHS: ReadonlyArray<FocalLengthOption> = [
  { id: '14mm', label: '14mm', tStop: 'T1.9' },
  { id: '24mm', label: '24mm', tStop: 'T1.9' },
  { id: '35mm', label: '35mm', tStop: 'T2.1' },
  { id: '50mm', label: '50mm', tStop: 'T1.9' },
  { id: '85mm', label: '85mm', tStop: 'T1.9' },
  { id: '100mm', label: '100mm', tStop: 'T2.8' },
  { id: '135mm', label: '135mm', tStop: 'T2.8' },
  { id: '180mm', label: '180mm', tStop: 'T3.5' },
];

export const EMPTY_CAMERA_SELECTION: CameraSettingsSelection = {
  cameraId: null,
  lensId: null,
  focalLengthIds: [],
};

const focalLengthOrder = new Map(FOCAL_LENGTHS.map((option, index) => [option.id, index]));

export const sortFocalLengthIds = (ids: FocalLengthOption['id'][]): FocalLengthOption['id'][] => (
  [...new Set(ids)].sort((a, b) => (focalLengthOrder.get(a) ?? 0) - (focalLengthOrder.get(b) ?? 0))
);

export const cloneCameraSelection = (selection: CameraSettingsSelection): CameraSettingsSelection => ({
  cameraId: selection.cameraId,
  lensId: selection.lensId,
  focalLengthIds: [...selection.focalLengthIds],
});

export const hasCameraSettings = (selection: CameraSettingsSelection): boolean => (
  !!selection.cameraId || !!selection.lensId || selection.focalLengthIds.length > 0
);

const resolveCamera = (id: CameraBodyOption['id'] | null): CameraBodyOption | null => (
  id ? CAMERA_BODIES.find(option => option.id === id) ?? null : null
);

const resolveLens = (id: LensFamilyOption['id'] | null): LensFamilyOption | null => (
  id ? LENS_FAMILIES.find(option => option.id === id) ?? null : null
);

const resolveFocalLengths = (ids: FocalLengthOption['id'][]): FocalLengthOption[] => (
  sortFocalLengthIds(ids)
    .map(id => FOCAL_LENGTHS.find(option => option.id === id))
    .filter((option): option is FocalLengthOption => Boolean(option))
);

export const buildCameraSelectionSummary = (selection: CameraSettingsSelection): string => {
  const camera = resolveCamera(selection.cameraId);
  const lens = resolveLens(selection.lensId);
  const focalLengths = resolveFocalLengths(selection.focalLengthIds);
  const leadParts = [camera?.label, lens?.label].filter(Boolean);
  const focalLabel = focalLengths.map(length => length.label).join(', ');

  if (leadParts.length > 0 && focalLabel) {
    return `${leadParts.join(' + ')}: ${focalLabel}`;
  }
  if (leadParts.length > 0) {
    return leadParts.join(' + ');
  }
  if (focalLabel) {
    return `Focal lengths: ${focalLabel}`;
  }
  return 'No camera settings selected';
};

export const buildCameraPromptPrefix = (selection: CameraSettingsSelection): string => {
  const camera = resolveCamera(selection.cameraId);
  const lens = resolveLens(selection.lensId);
  const focalLengths = resolveFocalLengths(selection.focalLengthIds);
  const parts: string[] = [];

  if (camera) {
    parts.push(`Camera: ${camera.promptLabel}`);
  }
  if (lens) {
    parts.push(`Lens: ${lens.promptLabel}`);
  }
  if (focalLengths.length > 0) {
    parts.push(`Focal lengths: ${focalLengths.map(length => length.label).join(', ')}`);
  }

  if (parts.length === 0) {
    return '';
  }

  return `${parts.join(', ')}. `;
};
