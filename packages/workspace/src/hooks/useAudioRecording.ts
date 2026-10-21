import { useState, useRef, useCallback, useEffect } from 'react';

interface UseAudioRecordingResult {
  isRecording: boolean;
  recordingDuration: number;
  startRecording: () => Promise<void>;
  stopRecording: () => Promise<Blob | null>;
  error: string | null;
}

export function useAudioRecording(): UseAudioRecordingResult {
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const intervalRef = useRef<number | null>(null);
  const startTimeRef = useRef<number>(0);
  const mountedRef = useRef(false);
  const requestRef = useRef(0);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      requestRef.current += 1; // A microphone permission reply can arrive after this session closes.
      if (intervalRef.current !== null) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
        streamRef.current = null;
      }
      const recorder = mediaRecorderRef.current;
      if (recorder && recorder.state !== 'inactive') recorder.stop();
      mediaRecorderRef.current = null;
    };
  }, []);

  const startRecording = useCallback(async () => {
    if (!mountedRef.current || mediaRecorderRef.current?.state === 'recording') return;
    const request = ++requestRef.current;
    let stream: MediaStream | null = null;
    try {
      setError(null);
      chunksRef.current = [];

      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!mountedRef.current || request !== requestRef.current) {
        stream.getTracks().forEach(track => track.stop());
        return;
      }
      streamRef.current = stream;

      // Determine supported MIME type
      const mimeType = MediaRecorder.isTypeSupported('audio/webm')
        ? 'audio/webm'
        : MediaRecorder.isTypeSupported('audio/mp4')
        ? 'audio/mp4'
        : 'audio/ogg';

      const mediaRecorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (mountedRef.current && request === requestRef.current && event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      mediaRecorder.start(100); // Collect data every 100ms
      setIsRecording(true);
      startTimeRef.current = Date.now();
      setRecordingDuration(0);

      // Update duration every 100ms
      intervalRef.current = window.setInterval(() => {
        const elapsed = (Date.now() - startTimeRef.current) / 1000;
        setRecordingDuration(elapsed);
      }, 100);
    } catch (err) {
      stream?.getTracks().forEach(track => track.stop());
      if (streamRef.current === stream) { streamRef.current = null; mediaRecorderRef.current = null; }
      if (!mountedRef.current || request !== requestRef.current) return;
      const message = err instanceof Error ? err.message : 'Failed to access microphone';
      setError(message);
      console.error('Recording error:', err);
    }
  }, []);

  const stopRecording = useCallback(async (): Promise<Blob | null> => {
    const request = requestRef.current;
    return new Promise((resolve) => {
      if (intervalRef.current !== null) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }

      const mediaRecorder = mediaRecorderRef.current;
      if (!mediaRecorder || mediaRecorder.state === 'inactive') {
        if (!mediaRecorder) requestRef.current += 1; // Cancel permission requests, preserving a recorder whose stop event is pending.
        if (mountedRef.current) setIsRecording(false);
        resolve(null);
        return;
      }

      const stream = streamRef.current;
      mediaRecorder.onstop = () => {
        stream?.getTracks().forEach(track => track.stop());
        if (streamRef.current === stream) streamRef.current = null;
        if (!mountedRef.current || request !== requestRef.current) { resolve(null); return; }
        const mimeType = mediaRecorder.mimeType || 'audio/webm';
        const blob = new Blob(chunksRef.current, { type: mimeType });
        chunksRef.current = [];

        setIsRecording(false);
        resolve(blob);
      };

      mediaRecorder.stop();
    });
  }, []);

  return {
    isRecording,
    recordingDuration,
    startRecording,
    stopRecording,
    error,
  };
}
