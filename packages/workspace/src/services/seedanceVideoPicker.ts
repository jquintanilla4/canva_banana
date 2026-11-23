import type { PromptBarControlOption } from '../components/promptBarControls';
import type { Seedance2VolcengineModel } from '../types';
import { SEEDANCE_2_VIDEO_MODEL_ID } from './modelConfig';
import { getSeedance2VolcengineModelCapabilities } from './volcengineModels';

export const TOKENHUB_SEEDANCE_PICKER_OPTION = {
  value: 'tokenhub/seedance-2',
  label: 'Seedance 2/2.5 (TokenHub)',
};

export const getSeedanceVideoPickerModelId = (modelId: string, model?: Seedance2VolcengineModel): string => (
  modelId === SEEDANCE_2_VIDEO_MODEL_ID && getSeedance2VolcengineModelCapabilities(model).provider === 'tokenhub'
    ? TOKENHUB_SEEDANCE_PICKER_OPTION.value
    : modelId
);

export const resolveSeedanceVideoPickerSelection = (pickerId: string, model: Seedance2VolcengineModel = 'standard') => {
  const tokenHubSelected = pickerId === TOKENHUB_SEEDANCE_PICKER_OPTION.value;
  if (!tokenHubSelected && pickerId !== SEEDANCE_2_VIDEO_MODEL_ID) return undefined;

  const current = getSeedance2VolcengineModelCapabilities(model);
  const nextProvider = tokenHubSelected ? 'tokenhub' : 'volcengine';
  const matchingModel: Seedance2VolcengineModel = current.family === '2.5'
    ? (tokenHubSelected ? 'tokenhub25' : 'seedance25')
    : (tokenHubSelected ? 'tokenhub20' : 'standard');
  return { modelId: SEEDANCE_2_VIDEO_MODEL_ID, model: current.provider === nextProvider ? model : matchingModel };
};

export const withSelectedSeedanceVideoPickerOption = (
  options: ReadonlyArray<PromptBarControlOption>,
  selectedId: string,
): ReadonlyArray<PromptBarControlOption> => (
  selectedId === TOKENHUB_SEEDANCE_PICKER_OPTION.value && !options.some(option => option.value === selectedId)
    ? [...options, { ...TOKENHUB_SEEDANCE_PICKER_OPTION, disabled: true }]
    : options
);
