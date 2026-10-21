import type { CanvasImage } from '../../types';

export const isVideoImage = (img: CanvasImage): img is CanvasImage & { element: HTMLVideoElement } =>
  img.mediaType === 'video';

export const isAudioImage = (img: CanvasImage): img is CanvasImage & { audioElement: HTMLAudioElement } =>
  img.mediaType === 'audio' && !!(img as { audioElement?: HTMLAudioElement }).audioElement;

