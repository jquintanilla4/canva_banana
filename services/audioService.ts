// Audio utilities for waveform generation and audio element management.

const AUDIO_OBJECT_URL_KEY = '__audioObjectUrl' as const;
type AudioWithObjectUrl = HTMLAudioElement & { [key in typeof AUDIO_OBJECT_URL_KEY]?: string };

export const getAudioObjectUrl = (element: HTMLAudioElement): string | undefined =>
  (element as AudioWithObjectUrl)[AUDIO_OBJECT_URL_KEY];

export const revokeAudioObjectUrl = (element: HTMLAudioElement): void => {
  const url = getAudioObjectUrl(element);
  if (!url) return;
  URL.revokeObjectURL(url);
  delete (element as AudioWithObjectUrl)[AUDIO_OBJECT_URL_KEY];
};

export const isAudioFileType = (fileType: string): boolean =>
  typeof fileType === 'string' && /audio\//.test(fileType);

export const loadAudioFromBlob = (blob: Blob): Promise<HTMLAudioElement> => {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(blob);
    const audio = document.createElement('audio');
    (audio as AudioWithObjectUrl)[AUDIO_OBJECT_URL_KEY] = objectUrl;
    audio.preload = 'metadata';
    audio.src = objectUrl;
    audio.onloadedmetadata = () => resolve(audio);
    audio.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Failed to load audio.'));
    };
  });
};

interface WaveformOptions {
  barColor?: string;
  backgroundColor?: string;
  barWidth?: number;
  barGap?: number;
}

export const generateWaveformImage = async (
  audioBlob: Blob,
  width: number,
  height: number,
  options: WaveformOptions = {}
): Promise<{ dataUrl: string; duration: number }> => {
  const {
    barColor = '#4ade80',
    backgroundColor = 'rgba(31, 41, 55, 0.9)',
    barWidth = 3,
    barGap = 1,
  } = options;

  const audioContext = new AudioContext();
  const arrayBuffer = await audioBlob.arrayBuffer();
  const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
  const duration = audioBuffer.duration;

  // Get the first channel data
  const channelData = audioBuffer.getChannelData(0);
  const totalSamples = channelData.length;

  // Calculate number of bars that fit
  const barCount = Math.floor(width / (barWidth + barGap));
  const samplesPerBar = Math.floor(totalSamples / barCount);

  // Calculate RMS amplitude for each bar
  const amplitudes: number[] = [];
  for (let i = 0; i < barCount; i++) {
    const start = i * samplesPerBar;
    const end = Math.min(start + samplesPerBar, totalSamples);
    let sum = 0;
    for (let j = start; j < end; j++) {
      sum += channelData[j] * channelData[j];
    }
    const rms = Math.sqrt(sum / (end - start));
    amplitudes.push(rms);
  }

  // Normalize amplitudes
  const maxAmplitude = Math.max(...amplitudes, 0.01);
  const normalizedAmplitudes = amplitudes.map(a => a / maxAmplitude);

  // Create canvas and draw waveform
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');

  if (!ctx) {
    await audioContext.close();
    throw new Error('Could not create canvas context for waveform.');
  }

  // Draw background
  ctx.fillStyle = backgroundColor;
  ctx.roundRect(0, 0, width, height, 8);
  ctx.fill();

  // Draw waveform bars
  ctx.fillStyle = barColor;
  const centerY = height / 2;
  const maxBarHeight = height * 0.8;

  for (let i = 0; i < normalizedAmplitudes.length; i++) {
    const x = i * (barWidth + barGap) + barGap / 2;
    const barHeight = Math.max(4, normalizedAmplitudes[i] * maxBarHeight);
    const y = centerY - barHeight / 2;

    // Draw bar with rounded caps
    ctx.beginPath();
    ctx.roundRect(x, y, barWidth, barHeight, barWidth / 2);
    ctx.fill();
  }

  await audioContext.close();
  return { dataUrl: canvas.toDataURL('image/png'), duration };
};

const writeWavString = (view: DataView, offset: number, value: string): void => {
  for (let i = 0; i < value.length; i += 1) {
    view.setUint8(offset + i, value.charCodeAt(i));
  }
};

const encodeWav = (buffer: AudioBuffer): ArrayBuffer => {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const format = 1;
  const bitDepth = 16;
  const blockAlign = numChannels * (bitDepth / 8);
  const byteRate = sampleRate * blockAlign;
  const dataSize = buffer.length * blockAlign;
  const wavBuffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(wavBuffer);

  writeWavString(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeWavString(view, 8, 'WAVE');
  writeWavString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, format, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitDepth, true);
  writeWavString(view, 36, 'data');
  view.setUint32(40, dataSize, true);

  let offset = 44;
  for (let i = 0; i < buffer.length; i += 1) {
    for (let channel = 0; channel < numChannels; channel += 1) {
      const sample = buffer.getChannelData(channel)[i] ?? 0;
      const clamped = Math.max(-1, Math.min(1, sample));
      view.setInt16(offset, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true);
      offset += 2;
    }
  }

  return wavBuffer;
};

export const convertAudioBlobToWav = async (audioBlob: Blob): Promise<Blob> => {
  const audioContext = new AudioContext();
  try {
    const arrayBuffer = await audioBlob.arrayBuffer();
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
    const wavBuffer = encodeWav(audioBuffer);
    return new Blob([wavBuffer], { type: 'audio/wav' });
  } finally {
    await audioContext.close();
  }
};

export const formatDuration = (seconds: number): string => {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
};
