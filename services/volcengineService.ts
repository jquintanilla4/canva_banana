import type { Seedance2Variant } from '../types';
import { addDebugLog } from './debugLog';

export type VolcengineQueueStatus = 'IN_QUEUE' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED'; // Match the existing queue panel states.

export type VolcengineQueueUpdate = {
  status: VolcengineQueueStatus;
  requestId?: string;
  logs?: string[];
  outputUrl?: string;
  error?: string;
};

type GenerateSeedanceVideoOptions = {
  modelId: string;
  variant: Seedance2Variant;
  aspectRatio: '21:9' | '16:9' | '4:3' | '1:1' | '3:4' | '9:16' | 'adaptive';
  duration: '4' | '5' | '6' | '7' | '8' | '9' | '10' | '11' | '12' | '13' | '14' | '15';
  resolution: '480p' | '720p' | '1080p';
  generateAudio: boolean;
  cameraFixed: boolean;
  primaryImageFile?: File | null;
  lastFrameImageFile?: File | null;
  referenceImageFiles?: File[];
  referenceVideoFiles?: File[];
  referenceAudioFiles?: File[];
  onQueueUpdate?: (update: VolcengineQueueUpdate) => void;
};

type VolcengineJobResponse = {
  id: string;
  modelId: string;
  modelLabel: string;
  variant: Seedance2Variant;
  prompt: string;
  status: VolcengineQueueStatus;
  createdAt: number;
  updatedAt: number;
  logs: string[];
  requestId?: string;
  remoteTaskId?: string;
  outputUrl?: string;
  lastFrameUrl?: string;
  error?: string;
  provider: 'volcengine';
};

const DEFAULT_VOLCENGINE_API_BASE_URL = 'http://localhost:8000'; // Local backend default.
const POLL_INTERVAL_MS = 3000; // Keep UI updates reasonably fresh.

const sleep = (ms: number) => new Promise(resolve => window.setTimeout(resolve, ms)); // Small polling helper.

const getVolcengineApiBaseUrl = (): string => {
  const raw = process.env.VOLCENGINE_API_BASE_URL?.trim() || DEFAULT_VOLCENGINE_API_BASE_URL;
  return raw.replace(/\/+$/, ''); // Avoid double slashes when building paths.
};

const mapJobToQueueUpdate = (job: VolcengineJobResponse): VolcengineQueueUpdate => ({
  status: job.status,
  requestId: job.requestId,
  logs: job.logs,
  outputUrl: job.outputUrl,
  error: job.error,
});

const parseJobResponse = async (response: Response): Promise<VolcengineJobResponse> => {
  const data = await response.json() as VolcengineJobResponse | { detail?: string };
  if (!response.ok) {
    throw new Error(typeof (data as { detail?: unknown }).detail === 'string' ? (data as { detail?: string }).detail as string : 'Volcengine request failed.');
  }
  return data as VolcengineJobResponse;
};

export const generateSeedanceVideo = async (
  prompt: string,
  options: GenerateSeedanceVideoOptions,
): Promise<{ videoUrl: string; requestId?: string; lastFrameUrl?: string }> => {
  const formData = new FormData();
  formData.set('prompt', prompt);
  formData.set('model_id', options.modelId);
  formData.set('variant', options.variant);
  formData.set('ratio', options.aspectRatio);
  formData.set('duration', options.duration);
  formData.set('resolution', options.resolution);
  formData.set('generate_audio', String(options.generateAudio));
  formData.set('camera_fixed', String(options.cameraFixed));

  if (options.primaryImageFile) {
    formData.append('primary_image', options.primaryImageFile); // Smart i2v primary frame.
  }
  if (options.lastFrameImageFile) {
    formData.append('last_frame_image', options.lastFrameImageFile); // Smart first/last-frame tail image.
  }
  options.referenceImageFiles?.forEach(file => {
    formData.append('reference_images', file); // Reference variant image refs.
  });
  options.referenceVideoFiles?.forEach(file => {
    formData.append('reference_videos', file); // Reference variant video refs.
  });
  options.referenceAudioFiles?.forEach(file => {
    formData.append('reference_audios', file); // Reference variant audio ref.
  });

  addDebugLog({
    direction: 'outbound',
    source: 'volcengine',
    title: options.modelId,
    message: 'Submitting Seedance 2 request',
    data: {
      variant: options.variant,
      aspectRatio: options.aspectRatio,
      duration: options.duration,
      resolution: options.resolution,
    },
  });

  const baseUrl = getVolcengineApiBaseUrl();
  const submitResponse = await fetch(`${baseUrl}/api/volcengine/jobs`, {
    method: 'POST',
    body: formData,
  });
  let job = await parseJobResponse(submitResponse);
  options.onQueueUpdate?.(mapJobToQueueUpdate(job));

  addDebugLog({
    direction: 'inbound',
    source: 'volcengine',
    title: options.modelId,
    message: 'Seedance 2 job accepted',
    data: {
      jobId: job.id,
      requestId: job.requestId,
      status: job.status,
    },
  });

  while (job.status === 'IN_QUEUE' || job.status === 'IN_PROGRESS') {
    await sleep(POLL_INTERVAL_MS);
    const pollResponse = await fetch(`${baseUrl}/api/volcengine/jobs/${job.id}`);
    job = await parseJobResponse(pollResponse);
    options.onQueueUpdate?.(mapJobToQueueUpdate(job));
  }

  addDebugLog({
    direction: job.status === 'COMPLETED' ? 'inbound' : 'error',
    source: 'volcengine',
    title: options.modelId,
    message: job.status === 'COMPLETED' ? 'Seedance 2 job completed' : 'Seedance 2 job failed',
    data: {
      jobId: job.id,
      requestId: job.requestId,
      outputUrl: job.outputUrl,
      error: job.error,
    },
  });

  if (job.status !== 'COMPLETED' || !job.outputUrl) {
    throw new Error(job.error || 'Volcengine did not return a video URL.');
  }

  return {
    videoUrl: job.outputUrl,
    requestId: job.requestId,
    lastFrameUrl: job.lastFrameUrl,
  };
};
