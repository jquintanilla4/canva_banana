import React from 'react';
import { PromptBar } from '../PromptBar';
import { ProviderSwitcher } from '../ProviderSwitcher';
import { Tooltip } from '../Tooltip';
import { LayersIcon, PlusIcon } from '../Icons';
import type { ApiProviderId } from '../../types';
import type { UseFalSettingsResult } from '../../hooks/useFalSettings';
import { resolveSeedanceVideoPickerSelection } from '../../services/seedanceVideoPicker';

type PromptBarProps = React.ComponentProps<typeof PromptBar>;

type AppFooterProps = {
  hidden: boolean; // Crop/transform sessions take over the footer area.
  providers: ApiProviderId[];
  apiProvider: ApiProviderId;
  providerLabels: Record<ApiProviderId, string>;
  onProviderSelect: (provider: ApiProviderId) => void;
  isLoading: boolean;
  fal: UseFalSettingsResult;
  prompt: string;
  onPromptChange: (value: string) => void;
  onSubmit: () => void;
  onLayerize?: () => void;
  isEmbeddedPromptBarActive: boolean;
  disablePromptInput: boolean;
  submitDisabled: boolean;
  submitDisabledReason: string | null;
  modelOptions: PromptBarProps['modelOptions'];
  selectedModel: PromptBarProps['selectedModel'];
  onModelModeChange: PromptBarProps['onModelModeChange'];
  modelControls: PromptBarProps['modelControls'];
  promptPlaceholder: string;
  showNegativePrompt: boolean;
  negativePrompt: string;
  onNegativePromptChange: (value: string) => void;
  promptOutlineColor: string | undefined;
  negativePromptOutlineColor: string | undefined;
  cameraThemeActive: boolean;
  klingSuggestionsEnabled: boolean;
  klingReferenceCount: number;
  klingSuggestionOptions: PromptBarProps['klingSuggestionOptions'];
  showCreateVideoPromptBarButton: boolean;
  onCreateVideoPromptBar: () => void;
  focusRequestToken: PromptBarProps['focusRequestToken'];
};

// Footer chrome: the provider switcher and the global prompt bar.
export function AppFooter({
  hidden,
  providers,
  apiProvider,
  providerLabels,
  onProviderSelect,
  isLoading,
  fal,
  prompt,
  onPromptChange,
  onSubmit,
  onLayerize,
  isEmbeddedPromptBarActive,
  disablePromptInput,
  submitDisabled,
  submitDisabledReason,
  modelOptions,
  selectedModel,
  onModelModeChange,
  modelControls,
  promptPlaceholder,
  showNegativePrompt,
  negativePrompt,
  onNegativePromptChange,
  promptOutlineColor,
  negativePromptOutlineColor,
  cameraThemeActive,
  klingSuggestionsEnabled,
  klingReferenceCount,
  klingSuggestionOptions,
  showCreateVideoPromptBarButton,
  onCreateVideoPromptBar,
  focusRequestToken,
}: AppFooterProps) {
  if (hidden) {
    return null;
  }
  const handleModelChange = (modelId: string) => {
    const seedance = resolveSeedanceVideoPickerSelection(modelId, fal.seedance2VolcengineModel);
    if (seedance && seedance.model !== fal.seedance2VolcengineModel) fal.handleSeedance2VolcengineModelChange(seedance.model);
    fal.handleFalModelChange(seedance?.modelId ?? modelId);
  };
  return (
    <>
      {providers.length > 0 && (
        <ProviderSwitcher
          providers={providers}
          activeProvider={apiProvider}
          labels={providerLabels}
          disabled={isLoading}
          onSelect={onProviderSelect}
        />
      )}
      <PromptBar
        prompt={prompt}
        onPromptChange={onPromptChange}
        onSubmit={onSubmit}
        submitAccessory={onLayerize && !isEmbeddedPromptBarActive ? (
          <Tooltip label="Layerize Image">
            <button
              type="button"
              aria-label="Layerize Image"
              onClick={onLayerize}
              disabled={isLoading}
              className="flex size-[2.64rem] shrink-0 items-center justify-center rounded-full border border-white/15 bg-white/5 text-white transition-colors hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-blue-400 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <LayersIcon className="size-[1.1rem]" aria-hidden="true" />
            </button>
          </Tooltip>
        ) : undefined}
        isLoading={isLoading}
        inputDisabled={disablePromptInput || isEmbeddedPromptBarActive}
        submitDisabled={submitDisabled || isEmbeddedPromptBarActive}
        submitDisabledReason={isEmbeddedPromptBarActive ? null : submitDisabledReason}
        modelOptions={modelOptions}
        selectedModel={selectedModel}
        onModelChange={handleModelChange}
        modelSelectDisabled={apiProvider !== 'fal' || isLoading}
        modelMode={fal.falModelMode}
        onModelModeChange={onModelModeChange}
        modelModeDisabled={apiProvider !== 'fal' || isLoading}
        modelControls={modelControls}
        promptPlaceholder={promptPlaceholder}
        showNegativePrompt={showNegativePrompt}
        showMultiPrompt={fal.isKlingV3VideoModel && fal.klingV3MultiPromptEnabled}
        multiPrompt={fal.klingV3MultiPrompt}
        onMultiPromptChange={fal.handleKlingV3MultiPromptChange}
        multiPromptPlaceholder="Describe the second Kling 3.0 Pro shot... (Cmd/Ctrl + Enter to generate)"
        multiPromptOutlineColor={fal.isKlingV3VideoModel && fal.klingV3MultiPromptEnabled ? '#38bdf8' : undefined}
        negativePrompt={negativePrompt}
        onNegativePromptChange={onNegativePromptChange}
        negativePromptPlaceholder="Describe what the video should avoid... (optional)"
        promptOutlineColor={promptOutlineColor}
        negativePromptOutlineColor={negativePromptOutlineColor}
        cameraThemeActive={cameraThemeActive}
        klingSuggestionsEnabled={klingSuggestionsEnabled}
        klingReferenceCount={klingReferenceCount}
        klingSuggestionOptions={klingSuggestionOptions}
        sizeMode={isEmbeddedPromptBarActive ? 'mini' : 'full'}
        leadingAccessory={showCreateVideoPromptBarButton ? (
          <Tooltip label="Create video prompt bar">
            <button
              type="button"
              onClick={onCreateVideoPromptBar}
              disabled={isLoading}
              className={`flex shrink-0 self-start items-center justify-center rounded-2xl bg-gray-900/70 text-white shadow-xl transition-all duration-300 ease-out hover:bg-gray-800/80 disabled:cursor-not-allowed disabled:opacity-45 ${isEmbeddedPromptBarActive ? 'h-[2.28rem] w-[2.28rem]' : 'h-[3.2rem] w-[3.2rem]'}`}
              aria-label="Create video prompt bar"
            >
              <PlusIcon className="h-4 w-4" />
            </button>
          </Tooltip>
        ) : undefined}
        focusRequestToken={focusRequestToken}
      />
    </>
  );
}
