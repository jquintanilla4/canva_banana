import { useCallback, useMemo, useState } from 'react';
import {
  KLING_DEFAULT_NEGATIVE_PROMPT,
  KLING_V3_VIDEO_MODEL_ID,
  KLING_VIDEO_MODEL_ID,
  VEO_31_IMAGE_TO_VIDEO_MODEL_ID,
  WAN_DEFAULT_NEGATIVE_PROMPT,
  WAN_27_VIDEO_MODEL_ID,
  WAN_VISION_ENHANCER_MODEL_ID,
} from '../services/modelConfig';
import type { FalVideoModelId } from '../services/modelConfig';

type UseVideoNegativePromptArgs = {
  isVideoMode: boolean;
  falVideoModelId: FalVideoModelId;
};

type UseVideoNegativePromptResult = {
  videoNegativePrompt: string;
  setVideoNegativePrompt: (value: string) => void;
  setVideoNegativePromptForModel: (modelId: FalVideoModelId, value: string) => void;
  shouldShowVideoNegativePrompt: boolean;
};

export function useVideoNegativePrompt({
  isVideoMode,
  falVideoModelId,
}: UseVideoNegativePromptArgs): UseVideoNegativePromptResult {
  const [klingNegativePrompt, setKlingNegativePrompt] = useState<string>(KLING_DEFAULT_NEGATIVE_PROMPT);
  const [wanNegativePrompt, setWanNegativePrompt] = useState<string>(WAN_DEFAULT_NEGATIVE_PROMPT);
  const [veo31NegativePrompt, setVeo31NegativePrompt] = useState<string>(KLING_DEFAULT_NEGATIVE_PROMPT);
  const setVideoNegativePromptForModel = useCallback((modelId: FalVideoModelId, value: string) => {
    if (modelId === WAN_VISION_ENHANCER_MODEL_ID || modelId === WAN_27_VIDEO_MODEL_ID) {
      setWanNegativePrompt(value); // Wan video models share one negative-prompt bucket.
      return;
    }
    if (modelId === VEO_31_IMAGE_TO_VIDEO_MODEL_ID) {
      setVeo31NegativePrompt(value); // Veo keeps its prompt separate from Kling and Wan.
      return;
    }
    if (modelId === KLING_VIDEO_MODEL_ID || modelId === KLING_V3_VIDEO_MODEL_ID) {
      setKlingNegativePrompt(value); // Kling models share one bucket.
    } // Models without a negative prompt of their own must not write into someone else's bucket.
  }, []);

  return useMemo(() => {
    const isWanVisionEnhancerVideoModel = isVideoMode && falVideoModelId === WAN_VISION_ENHANCER_MODEL_ID;
    const isWan27VideoModel = isVideoMode && falVideoModelId === WAN_27_VIDEO_MODEL_ID;
    const isVeo31VideoModel = isVideoMode && falVideoModelId === VEO_31_IMAGE_TO_VIDEO_MODEL_ID;
    const isKlingNegativePromptModel = isVideoMode && falVideoModelId === KLING_VIDEO_MODEL_ID;
    const isKlingV3VideoModel = isVideoMode && falVideoModelId === KLING_V3_VIDEO_MODEL_ID;
    const shouldShowVideoNegativePrompt = isWanVisionEnhancerVideoModel
      || isWan27VideoModel
      || isKlingNegativePromptModel
      || isKlingV3VideoModel
      || isVeo31VideoModel;

    const videoNegativePrompt = isWanVisionEnhancerVideoModel || isWan27VideoModel
      ? wanNegativePrompt
      : isVeo31VideoModel
        ? veo31NegativePrompt
        : klingNegativePrompt;
    const setVideoNegativePrompt = isWanVisionEnhancerVideoModel || isWan27VideoModel
      ? setWanNegativePrompt
      : isVeo31VideoModel
        ? setVeo31NegativePrompt
        : setKlingNegativePrompt;

    return {
      videoNegativePrompt,
      setVideoNegativePrompt,
      setVideoNegativePromptForModel,
      shouldShowVideoNegativePrompt,
    };
  }, [falVideoModelId, isVideoMode, klingNegativePrompt, setVideoNegativePromptForModel, veo31NegativePrompt, wanNegativePrompt]);
}
