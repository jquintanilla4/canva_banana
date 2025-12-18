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
