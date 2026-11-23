import type { PromptBarSelectControl } from '../../components/promptBarControls';
import { FAL_RESOLUTION_OPTIONS } from '../nanoBananaConfig';
import { TOKENHUB_NANO_BANANA_ASPECT_RATIO_OPTIONS, TOKENHUB_NANO_BANANA_THINKING_LEVEL_OPTIONS } from '../tokenHubNanoBananaConfig';
import { resolveTokenHubNanoBananaRunSettings, type TokenHubNanoBananaRunSettingsInput } from '../tokenHubNanoBananaRunSettings';

interface TokenHubNanoBananaControlsInput extends Omit<TokenHubNanoBananaRunSettingsInput<'text_to_image'>, 'kind'> {
  isLoading: boolean;
  onAspectRatioChange: (value: string) => void;
  onResolutionChange: (value: string) => void;
  onThinkingLevelChange: (value: string) => void;
}

export const buildTokenHubNanoBananaControls = (input: TokenHubNanoBananaControlsInput): ReadonlyArray<PromptBarSelectControl> => {
  const settings = resolveTokenHubNanoBananaRunSettings({ ...input, kind: 'text_to_image' }, 'restore');
  return [{
    id: 'tokenhub-nano-banana-aspect-ratio-select',
    ariaLabel: 'Select NanoBanana 2.1 (TokenHub) aspect ratio',
    options: TOKENHUB_NANO_BANANA_ASPECT_RATIO_OPTIONS,
    value: settings.aspectRatioSelection,
    onChange: input.onAspectRatioChange,
    disabled: input.isLoading,
  }, {
    id: 'tokenhub-nano-banana-resolution-select',
    ariaLabel: 'Select NanoBanana 2.1 (TokenHub) resolution',
    options: FAL_RESOLUTION_OPTIONS,
    value: settings.resolution,
    onChange: input.onResolutionChange,
    disabled: input.isLoading,
  }, {
    id: 'tokenhub-nano-banana-thinking-level-select',
    prefixLabel: 'Thinking',
    ariaLabel: 'Select NanoBanana 2.1 (TokenHub) thinking level',
    options: TOKENHUB_NANO_BANANA_THINKING_LEVEL_OPTIONS,
    value: settings.thinkingLevel,
    onChange: input.onThinkingLevelChange,
    disabled: input.isLoading,
  }];
};
