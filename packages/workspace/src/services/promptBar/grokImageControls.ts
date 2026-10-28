import type { PromptBarSelectControl } from '../../components/promptBarControls';
import {
  FAL_GROK_ASPECT_RATIO_OPTIONS, GROK_IMAGE_RESOLUTION_OPTIONS, GROK_IMAGE_QUALITY_OPTIONS,
  GROK_IMAGE_OUTPUT_FORMAT_OPTIONS, GROK_IMAGE_NUM_IMAGE_OPTIONS,
} from '../grokImageConfig';
import { resolveGrokImageRunSettings, type GrokImageRunSettings } from '../grokImageRunSettings';
import type { ImageRunKind } from '../imageRunSettings';

export interface GrokImageControlsInput extends Partial<Omit<GrokImageRunSettings, 'kind' | 'endpoint'>> {
  kind?: ImageRunKind;
  isLoading: boolean;
  onAspectRatioChange: (value: string) => void;
  onResolutionChange: (value: string) => void;
  onQualityChange: (value: string) => void;
  onOutputFormatChange: (value: string) => void;
  onImagePassthroughChange: (value: boolean) => void;
  onEnableSafetyCheckerChange: (value: boolean) => void;
  onNumImagesChange: (value: number) => void;
}

const BOOLEAN_OPTIONS = [{ value: 'false', label: 'No' }, { value: 'true', label: 'Yes' }] as const;

export const buildGrokImageControls = (input: GrokImageControlsInput): ReadonlyArray<PromptBarSelectControl> => {
  const settings = resolveGrokImageRunSettings({ ...input, kind: input.kind ?? 'text_to_image' }, 'restore');
  return [{
    id: 'grok-image-aspect-ratio-select', prefixLabel: 'Aspect ratio', ariaLabel: 'Select Grok image aspect ratio',
    options: FAL_GROK_ASPECT_RATIO_OPTIONS, value: settings.aspectRatio,
    onChange: input.onAspectRatioChange, disabled: input.isLoading,
  }, {
    id: 'grok-image-resolution-select', prefixLabel: 'Resolution', ariaLabel: 'Select Grok image resolution',
    options: GROK_IMAGE_RESOLUTION_OPTIONS, value: settings.resolution,
    onChange: input.onResolutionChange, disabled: input.isLoading,
  }, {
    id: 'grok-image-quality-select', prefixLabel: 'Quality', ariaLabel: 'Select Grok image quality',
    options: GROK_IMAGE_QUALITY_OPTIONS, value: settings.quality,
    tooltip: 'Auto currently uses Low for text generation and Medium for image edits.',
    onChange: input.onQualityChange, disabled: input.isLoading,
  }, {
    id: 'grok-image-output-format-select', prefixLabel: 'Format', ariaLabel: 'Select Grok image output format',
    options: GROK_IMAGE_OUTPUT_FORMAT_OPTIONS, value: settings.outputFormat,
    onChange: input.onOutputFormatChange, disabled: input.isLoading,
  }, {
    id: 'grok-image-passthrough-select', prefixLabel: 'Image passthrough', ariaLabel: 'Enable Grok image passthrough',
    options: BOOLEAN_OPTIONS, value: String(settings.imagePassthrough),
    tooltip: 'Keep provider originals without Fal re-encoding. The returned format may differ from Format.',
    onChange: value => input.onImagePassthroughChange(value === 'true'), disabled: input.isLoading,
  }, {
    id: 'grok-image-safety-checker-select', prefixLabel: 'Safety checker', ariaLabel: 'Enable Grok image safety checker',
    options: BOOLEAN_OPTIONS, value: String(settings.enableSafetyChecker),
    tooltip: 'Disabling the safety checker requires authorization on your Fal account.',
    onChange: value => input.onEnableSafetyCheckerChange(value === 'true'), disabled: input.isLoading,
  }, {
    id: 'grok-image-num-images-select', prefixLabel: 'Images', ariaLabel: 'Select Grok image output count',
    options: GROK_IMAGE_NUM_IMAGE_OPTIONS.map(value => ({ value: String(value), label: String(value) })),
    value: String(settings.numImages),
    onChange: value => input.onNumImagesChange(Number(value)), disabled: input.isLoading,
  }];
};
