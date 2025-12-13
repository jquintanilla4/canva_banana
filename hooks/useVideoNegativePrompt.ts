import { useMemo, useState } from 'react';
import {
  KLING_DEFAULT_NEGATIVE_PROMPT,
  KLING_26_VIDEO_MODEL_ID,
  KLING_VIDEO_MODEL_ID,
  ONE_TO_ALL_ANIMATE_MODEL_ID,
  ONE_TO_ALL_DEFAULT_NEGATIVE_PROMPT,
  WAN_DEFAULT_NEGATIVE_PROMPT,
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
  const [oneToAllNegativePrompt, setOneToAllNegativePrompt] = useState<string>(ONE_TO_ALL_DEFAULT_NEGATIVE_PROMPT);

  return useMemo(() => {
    const isWanVisionEnhancerVideoModel = isVideoMode && falVideoModelId === WAN_VISION_ENHANCER_MODEL_ID;
    const isOneToAllVideoModel = isVideoMode && falVideoModelId === ONE_TO_ALL_ANIMATE_MODEL_ID;
    const isKlingNegativePromptModel = isVideoMode && (
      falVideoModelId === KLING_VIDEO_MODEL_ID
      || falVideoModelId === KLING_26_VIDEO_MODEL_ID
    );
    const shouldShowVideoNegativePrompt = isWanVisionEnhancerVideoModel || isOneToAllVideoModel || isKlingNegativePromptModel;

    const videoNegativePrompt = isWanVisionEnhancerVideoModel
      ? wanNegativePrompt
      : isOneToAllVideoModel
        ? oneToAllNegativePrompt
        : klingNegativePrompt;
    const setVideoNegativePrompt = isWanVisionEnhancerVideoModel
      ? setWanNegativePrompt
      : isOneToAllVideoModel
        ? setOneToAllNegativePrompt
        : setKlingNegativePrompt;

    return {
      videoNegativePrompt,
      setVideoNegativePrompt,
      shouldShowVideoNegativePrompt,
    };
  }, [falVideoModelId, isVideoMode, klingNegativePrompt, oneToAllNegativePrompt, wanNegativePrompt]);
}
