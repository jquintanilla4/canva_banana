import type { PromptBarSelectControl } from '../../components/promptBarControls';
import { getNanoBananaAspectRatioOptions, FAL_RESOLUTION_OPTIONS, NANO_BANANA_21_EDIT_MODEL_ID, NANO_BANANA_THINKING_LEVEL_OPTIONS } from '../nanoBananaConfig';
import { resolveNanoBananaRunSettings, type NanoBananaRunSettingsInput } from '../nanoBananaRunSettings';

interface NanoBananaControlsInput extends Omit<NanoBananaRunSettingsInput, 'kind'> {
  isLoading: boolean;
  onAspectRatioChange: (value: string) => void;
  onResolutionChange: (value: string) => void;
  onWebSearchChange: (value: string) => void;
  onThinkingLevelChange: (value: string) => void;
}
export const buildNanoBananaControls = (input: NanoBananaControlsInput): ReadonlyArray<PromptBarSelectControl> => {
  const settings = resolveNanoBananaRunSettings({ ...input, kind: 'text_to_image' }, 'restore');
  const controls: PromptBarSelectControl[] = [{
    id: 'fal-aspect-ratio-select', ariaLabel: 'Select aspect ratio',
    options: getNanoBananaAspectRatioOptions(settings.modelId), value: settings.aspectRatioSelection,
    onChange: input.onAspectRatioChange, disabled: input.isLoading,
  }, {
    id: 'fal-resolution-select', ariaLabel: 'Select resolution',
    options: FAL_RESOLUTION_OPTIONS,
    value: settings.resolution, onChange: input.onResolutionChange, disabled: input.isLoading,
  }];
  if (settings.modelId === NANO_BANANA_21_EDIT_MODEL_ID) controls.push({
    id: 'fal-nano-banana-web-search-select', prefixLabel: 'Web search', ariaLabel: 'Select Nano Banana web search',
    options: [{ value: 'false', label: 'Off' }, { value: 'true', label: 'On' }],
    value: String(settings.webSearch), onChange: input.onWebSearchChange, disabled: input.isLoading,
  }, {
    id: 'fal-nano-banana-thinking-level-select', prefixLabel: 'Thinking', ariaLabel: 'Select Nano Banana thinking level',
    options: NANO_BANANA_THINKING_LEVEL_OPTIONS, value: settings.thinkingLevel,
    onChange: input.onThinkingLevelChange, disabled: input.isLoading,
  });
  return controls;
};
