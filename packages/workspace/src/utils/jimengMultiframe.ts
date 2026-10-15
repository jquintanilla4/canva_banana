import {
  isValidJimengMultiframeImageCount,
  JIMENG_MULTIFRAME_MAX_IMAGES,
  JIMENG_MULTIFRAME_MIN_IMAGES,
} from '../services/modelConfig';

export const parseJimengMultiframeTransitionPrompts = (prompt: string): string[] => (
  prompt.split('||').map(value => value.trim()).filter(Boolean)
); // Multi-frame uses one non-empty segment per transition.

export const hasValidJimengMultiframePrompt = (prompt: string, imageCount: number): boolean => {
  if (!prompt.trim()) return false;
  if (imageCount <= 2) return true; // Two frames use the full prompt as their single transition description.
  return parseJimengMultiframeTransitionPrompts(prompt).length === imageCount - 1;
};

export const getJimengMultiframeDisabledReason = (
  prompt: string,
  selectedMediaCount: number,
  selectedStillImageCount: number,
): string | null => {
  if (selectedMediaCount !== selectedStillImageCount) {
    return 'Jimeng Multi-frame only accepts still images.';
  }
  if (!isValidJimengMultiframeImageCount(selectedStillImageCount)) {
    return `Jimeng Multi-frame requires between ${JIMENG_MULTIFRAME_MIN_IMAGES} and ${JIMENG_MULTIFRAME_MAX_IMAGES} selected still images.`;
  }
  if (hasValidJimengMultiframePrompt(prompt, selectedStillImageCount)) {
    return null;
  }
  return selectedStillImageCount > 2
    ? `Jimeng Multi-frame requires ${selectedStillImageCount - 1} transition prompts separated by ||.`
    : 'Describe the transition between the two selected images.';
};
