import type { PromptBarSelectControl } from '../../components/promptBarControls';
import {
  GPT_IMAGE_26_IMAGE_SIZE_OPTIONS, GPT_IMAGE_26_QUALITY_OPTIONS, GPT_IMAGE_26_BACKGROUND_OPTIONS,
  GPT_IMAGE_26_REASONING_OPTIONS, GPT_IMAGE_26_FORMAT_OPTIONS, GPT_IMAGE_26_IMAGE_FORMAT_OPTIONS,
  type GptImage26Quality, type GptImage26Background, type GptImage26ReasoningEffort, type GptImage26OutputFormat,
} from '../gptImage26Config';
import { resolveGptImage26RunSettings } from '../gptImage26RunSettings';

interface GptImage26ControlsInput {
  isLoading: boolean;
  isEditing: boolean;
  quality?: GptImage26Quality;
  background?: GptImage26Background;
  reasoningEffort?: GptImage26ReasoningEffort;
  outputFormat?: GptImage26OutputFormat;
  frameCount?: number;
  frameDurationMs?: number;
  onFrameCountChange: (value: string) => void;
  onFrameDurationMsChange: (value: string) => void;
  imageSizeSelection?: string;
  onSizeChange: (value: string) => void;
  onQualityChange: (value: string) => void;
  onBackgroundChange: (value: string) => void;
  onReasoningEffortChange: (value: string) => void;
  onOutputFormatChange: (value: string) => void;
}
export const buildGptImage26Controls = (input: GptImage26ControlsInput): ReadonlyArray<PromptBarSelectControl> => {
  const settings = resolveGptImage26RunSettings({ ...input, kind: input.isEditing ? 'image_edit' : 'text_to_image' }, 'restore');
  const animationControls = settings.outputFormat === 'gif' ? [
    { key: 'frames', label: 'Frames', options: Array.from({ length: 15 }, (_, index) => ({ value: String(index + 2), label: String(index + 2) })), value: String(settings.frameCount), onChange: input.onFrameCountChange },
    { key: 'frame-duration', label: 'Frame duration', options: [...new Set([20, 50, 100, 200, 500, 1000, 2000, settings.frameDurationMs])].sort((a, b) => a - b).map(value => ({ value: String(value), label: `${value} ms` })), value: String(settings.frameDurationMs), onChange: input.onFrameDurationMsChange },
  ] : [];
  return [
    { key: 'size', label: 'Size', options: GPT_IMAGE_26_IMAGE_SIZE_OPTIONS, value: settings.imageSizeSelection, onChange: input.onSizeChange },
    { key: 'quality', label: 'Quality', options: GPT_IMAGE_26_QUALITY_OPTIONS, value: settings.quality, onChange: input.onQualityChange },
    { key: 'background', label: 'Background', options: GPT_IMAGE_26_BACKGROUND_OPTIONS, value: settings.background, onChange: input.onBackgroundChange },
    { key: 'reasoning', label: 'Reasoning', options: GPT_IMAGE_26_REASONING_OPTIONS, value: settings.reasoningEffort, onChange: input.onReasoningEffortChange },
    { key: 'format', label: 'Format', options: input.isEditing ? GPT_IMAGE_26_IMAGE_FORMAT_OPTIONS : GPT_IMAGE_26_FORMAT_OPTIONS, value: settings.outputFormat, onChange: input.onOutputFormatChange },
    ...animationControls,
  ].map(control => ({
    id: `fal-gpt-image-26-${control.key}-select`, prefixLabel: control.label,
    ariaLabel: `Select GPT Image 2.6 ${control.label.toLowerCase()}`, options: control.options,
    value: control.value, onChange: control.onChange, disabled: input.isLoading,
  }));
};
