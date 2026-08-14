import { useCallback, useEffect } from 'react';
import { useAudioRecording } from './useAudioRecording';
import { convertAudioBlobToWav, generateWaveformImage, loadAudioFromBlob } from '../services/audioService';
import { Tool, type CanvasImage } from '../types';
import type { AppState } from './useCanvasHistory';

type UseAudioRecordingToCanvasArgs = {
  setState: (updater: (prevState: AppState) => AppState) => void;
  setSelectedImageIds: (ids: string[]) => void;
  setReferenceImageIds: (ids: string[]) => void;
  setTool: (tool: Tool) => void;
  setToastMessage: (message: string | null) => void;
  setError: (message: string | null) => void;
};

// Voice recording workflow: record via MediaRecorder, convert to WAV, render a
// waveform card, and drop the result onto the canvas as selectable audio media.
export function useAudioRecordingToCanvas({
  setState,
  setSelectedImageIds,
  setReferenceImageIds,
  setTool,
  setToastMessage,
  setError,
}: UseAudioRecordingToCanvasArgs) {
  const {
    isRecording,
    recordingDuration,
    startRecording,
    stopRecording,
    error: recordingError,
  } = useAudioRecording();

  // Handle audio recording toggle
  const handleRecordToggle = useCallback(async () => {
    if (isRecording) {
      const audioBlob = await stopRecording();
      if (audioBlob) {
        try {
          const wavBlob = await convertAudioBlobToWav(audioBlob);
          // Generate waveform from the recording
          const displayWidth = 400;
          const displayHeight = 80;
          const audioElement = await loadAudioFromBlob(wavBlob);
          const { dataUrl: waveformImageData, duration } = await generateWaveformImage(
            wavBlob,
            displayWidth,
            displayHeight
          );

          // Create waveform image element
          const waveformImg = new Image();
          await new Promise<void>((resolve, reject) => {
            waveformImg.onload = () => resolve();
            waveformImg.onerror = () => reject(new Error('Failed to load waveform image'));
            waveformImg.src = waveformImageData;
          });

          // Create the audio file
          const file = new File([wavBlob], `recording-${Date.now()}.wav`, { type: wavBlob.type });

          // Add to canvas at center
          const newCanvasAudio: CanvasImage = {
            id: crypto.randomUUID(),
            element: waveformImg,
            mediaType: 'audio' as const,
            x: (window.innerWidth / 2) - (displayWidth / 2),
            y: (window.innerHeight / 2) - (displayHeight / 2),
            width: displayWidth,
            height: displayHeight,
            rotation: 0,
            naturalWidth: displayWidth,
            naturalHeight: displayHeight,
            file,
            isPlaying: false,
            hasAudio: true,
            audioElement,
            waveformImageData,
            audioDuration: duration,
            currentPlaybackTime: 0,
            metadata: { source: 'imported' as const },
          };

          setState(prevState => ({
            ...prevState,
            images: [...prevState.images, newCanvasAudio],
          }));
          setSelectedImageIds([newCanvasAudio.id]);
          setReferenceImageIds([]);
          setTool(Tool.SELECTION);
          setToastMessage('Recording saved');
          setTimeout(() => setToastMessage(null), 2000);
        } catch (err) {
          console.error('Failed to process recording:', err);
          setError('Failed to process recording.');
        }
      }
    } else {
      await startRecording();
    }
  }, [isRecording, stopRecording, startRecording, setState, setTool, setSelectedImageIds, setReferenceImageIds, setToastMessage, setError]);

  // Propagate recording errors to main error state
  useEffect(() => {
    if (recordingError) {
      setError(recordingError);
    }
  }, [recordingError, setError]);

  return {
    isRecording,
    recordingDuration,
    handleRecordToggle,
  };
}
