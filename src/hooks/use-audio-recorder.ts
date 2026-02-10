"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type UseAudioRecorderResult = {
  isSupported: boolean;
  isRecording: boolean;
  startRecording: () => Promise<void>;
  stopRecording: () => Promise<File | null>;
  cancelRecording: () => void;
};

/**
 * Formatos de áudio compatíveis com a API do WhatsApp, em ordem de preferência.
 * OGG/OPUS é o formato nativo de áudio do WhatsApp.
 */
const WHATSAPP_AUDIO_FORMATS = [
  { mimeType: "audio/ogg; codecs=opus", ext: "ogg" },
  { mimeType: "audio/ogg;codecs=opus", ext: "ogg" },
  { mimeType: "audio/mp4", ext: "m4a" },
  { mimeType: "audio/webm; codecs=opus", ext: "webm" },
  { mimeType: "audio/webm", ext: "webm" },
] as const;

const pickRecorderFormat = () => {
  if (typeof MediaRecorder === "undefined") return null;
  for (const fmt of WHATSAPP_AUDIO_FORMATS) {
    if (MediaRecorder.isTypeSupported(fmt.mimeType)) return fmt;
  }
  return null;
};

export const useAudioRecorder = (): UseAudioRecorderResult => {
  const [isRecording, setIsRecording] = useState(false);
  const [isSupported, setIsSupported] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const resolveRef = useRef<((file: File | null) => void) | null>(null);
  const formatRef = useRef<(typeof WHATSAPP_AUDIO_FORMATS)[number] | null>(null);

  useEffect(() => {
    const canRecord =
      typeof window !== "undefined" &&
      typeof navigator !== "undefined" &&
      Boolean(navigator.mediaDevices?.getUserMedia);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- precisamos descobrir o suporte apenas após montar no browser
    setIsSupported(canRecord);
    formatRef.current = pickRecorderFormat();

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

    const fmt = formatRef.current;
    const recorder = fmt
      ? new MediaRecorder(stream, { mimeType: fmt.mimeType })
      : new MediaRecorder(stream);
    recorderRef.current = recorder;

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        chunksRef.current.push(event.data);
      }
    };

    recorder.onstop = () => {
      const ext = fmt?.ext ?? "ogg";
      const blobType = fmt?.mimeType ?? "audio/ogg";
      const blob = new Blob(chunksRef.current, { type: blobType });
      const file = chunksRef.current.length
        ? new File([blob], `audio-${Date.now()}.${ext}`, { type: blobType })
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
