"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type UseAudioRecorderResult = {
  isSupported: boolean;
  isRecording: boolean;
  startRecording: () => Promise<void>;
  stopRecording: () => Promise<File | null>;
  cancelRecording: () => void;
};

export const useAudioRecorder = (): UseAudioRecorderResult => {
  const [isRecording, setIsRecording] = useState(false);
  const [isSupported, setIsSupported] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const resolveRef = useRef<((file: File | null) => void) | null>(null);

  useEffect(() => {
    const canRecord =
      typeof window !== "undefined" &&
      typeof navigator !== "undefined" &&
      Boolean(navigator.mediaDevices?.getUserMedia);
    setIsSupported(canRecord);

    return () => {
      if (recorderRef.current?.state === "recording") {
        recorderRef.current.stop();
      }
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  const cleanupStream = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  };

  const startRecording = useCallback(async () => {
    if (!isSupported || isRecording) {
      return;
    }
    chunksRef.current = [];
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    streamRef.current = stream;

    const recorder = new MediaRecorder(stream);
    recorderRef.current = recorder;

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        chunksRef.current.push(event.data);
      }
    };

    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: "audio/webm" });
      const file = chunksRef.current.length
        ? new File([blob], `audio-${Date.now()}.webm`, { type: blob.type })
        : null;

      cleanupStream();
      setIsRecording(false);
      resolveRef.current?.(file);
      resolveRef.current = null;
    };

    recorder.start();
    setIsRecording(true);
  }, [isRecording, isSupported]);

  const stopRecording = useCallback(() => {
    if (!recorderRef.current) {
      return Promise.resolve(null);
    }

    return new Promise<File | null>((resolve) => {
      resolveRef.current = resolve;
      recorderRef.current?.stop();
    });
  }, []);

  const cancelRecording = useCallback(() => {
    if (recorderRef.current?.state === "recording") {
      recorderRef.current.stop();
    }
    cleanupStream();
    setIsRecording(false);
    resolveRef.current?.(null);
    resolveRef.current = null;
    chunksRef.current = [];
  }, []);

  return {
    isSupported,
    isRecording,
    startRecording,
    stopRecording,
    cancelRecording,
  };
};
