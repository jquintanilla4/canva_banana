import { resolveKrea3RunSettings, type Krea3RunSettings } from '../krea3RunSettings';
import type { ImageRunKind } from '../imageRunSettings';
import type { GenerateImageOptions } from './types';

type Krea3Options<Kind extends ImageRunKind> = Pick<GenerateImageOptions, 'imageSize' | 'krea3Variant' | 'krea3ReasoningLevel'> & {
  krea3RunSettings?: Krea3RunSettings<Kind>;
};

export const resolveKrea3SettingsForRequest = <Kind extends ImageRunKind>(kind: Kind, options: Krea3Options<Kind>): Krea3RunSettings<Kind> =>
  options.krea3RunSettings ?? resolveKrea3RunSettings({
    kind, variant: options.krea3Variant, reasoningLevel: options.krea3ReasoningLevel, imageSizeSelection: options.imageSize,
  });

export const serializeKrea3Input = (settings: Krea3RunSettings) => ({
  model: settings.variant,
  reasoning_level: settings.reasoningLevel,
  ...(settings.reasoningLevel !== 'ultra' ? { image_size: settings.imageSizeSelection } : {}), // Ultra always generates at 2K.
  output_format: 'png' as const,
  sync_mode: false as const,
});
