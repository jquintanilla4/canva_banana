import { useMemo, useState } from 'react';
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
  shouldShowVideoNegativePrompt: boolean;
};

export function useVideoNegativePrompt({
  isVideoMode,
  falVideoModelId,
}: UseVideoNegativePromptArgs): UseVideoNegativePromptResult {
  const [klingNegativePrompt, setKlingNegativePrompt] = useState<string>(KLING_DEFAULT_NEGATIVE_PROMPT);
  const [wanNegativePrompt, setWanNegativePrompt] = useState<string>(WAN_DEFAULT_NEGATIVE_PROMPT);
  const [veo31NegativePrompt, setVeo31NegativePrompt] = useState<string>(KLING_DEFAULT_NEGATIVE_PROMPT);

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
      shouldShowVideoNegativePrompt,
    };
  }, [falVideoModelId, isVideoMode, klingNegativePrompt, veo31NegativePrompt, wanNegativePrompt]);
}
