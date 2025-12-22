import {
  CRYSTAL_UPSCALER_MODEL_ID,
  INFINITALK_VIDEO_MODEL_ID,
  ONE_TO_ALL_ANIMATE_MODEL_ID,
  SEEDVR_UPSCALER_MODEL_ID,
  WAN_ANIMATE_MODEL_ID,
  WAN_VISION_ENHANCER_MODEL_ID,
} from './modelConfig';

// Blind Test Mode: Anonymizes model names with random codenames for unbiased testing.

const ADJECTIVES = [
  'Swift', 'Silent', 'Brave', 'Clever', 'Noble', 'Fierce', 'Gentle', 'Bold',
  'Keen', 'Agile', 'Mystic', 'Cosmic', 'Golden', 'Silver', 'Crystal', 'Shadow',
  'Radiant', 'Serene', 'Vivid', 'Stellar', 'Lunar', 'Solar', 'Arctic', 'Blazing',
] as const;

const ANIMALS = [
  'Falcon', 'Panther', 'Wolf', 'Eagle', 'Tiger', 'Hawk', 'Dolphin', 'Phoenix',
  'Dragon', 'Lion', 'Bear', 'Fox', 'Owl', 'Raven', 'Cobra', 'Jaguar',
  'Lynx', 'Orca', 'Pegasus', 'Griffin', 'Sparrow', 'Viper', 'Crane', 'Heron',
] as const;

export type BlindTestMapping = Map<string, string>;

const OPEN_SOURCE_MODEL_ALIASES: Record<string, string> = {
  [CRYSTAL_UPSCALER_MODEL_ID]: 'Organic Upscaler',
  [SEEDVR_UPSCALER_MODEL_ID]: 'General Upscaler',
  [WAN_ANIMATE_MODEL_ID]: 'Character Replacement 01',
  [ONE_TO_ALL_ANIMATE_MODEL_ID]: 'Character Replacement 02',
  [INFINITALK_VIDEO_MODEL_ID]: 'Lipsync v2v 01',
  [WAN_VISION_ENHANCER_MODEL_ID]: 'Video Enhancer',
};

const generateCodename = (): string => {
  const adjective = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
  const animal = ANIMALS[Math.floor(Math.random() * ANIMALS.length)];
  return `${adjective} ${animal}`;
};

const getOrCreateCodename = (modelId: string, mapping: BlindTestMapping): string => {
  if (!mapping.has(modelId)) {
    const existingCodenames = new Set(mapping.values());
    let codename: string;
    do {
      codename = generateCodename();
    } while (existingCodenames.has(codename));
    mapping.set(modelId, codename);
  }
  return mapping.get(modelId)!;
};

export const applyBlindTestMode = <T extends { value: string; label: string }>(
  options: ReadonlyArray<T>,
  mapping: BlindTestMapping,
  isActive: boolean,
): ReadonlyArray<T> => {
  if (!isActive) return options;

  return options.map(option => ({
    ...option,
    label: getOrCreateCodename(option.value, mapping),
  }));
};

export const applyOpenSourceAliasMode = <T extends { value: string; label: string }>(
  options: ReadonlyArray<T>,
  isActive: boolean,
): ReadonlyArray<T> => {
  if (!isActive) return options;

  return options.map(option => {
    const alias = OPEN_SOURCE_MODEL_ALIASES[option.value];
    if (!alias) return option;
    return { ...option, label: alias };
  });
};
