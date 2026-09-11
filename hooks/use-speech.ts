"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
};

function getRecognition(): SpeechRecognitionLike | null {
  if (typeof window === "undefined") return null;
  const Ctor =
    (window as unknown as { SpeechRecognition?: new () => SpeechRecognitionLike }).SpeechRecognition ||
    (window as unknown as { webkitSpeechRecognition?: new () => SpeechRecognitionLike })
      .webkitSpeechRecognition;
  if (!Ctor) return null;
  return new Ctor();
}

export function useSpeechToText() {
  const recRef = useRef<SpeechRecognitionLike | null>(null);
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setSupported(Boolean(getRecognition()));
  }, []);

  const stop = useCallback(() => {
    recRef.current?.stop();
    setListening(false);
  }, []);

  const start = useCallback(() => {
    setError(null);
    setTranscript("");
    const rec = getRecognition();
    if (!rec) {
      setError("Tu navegador no soporta Web Speech API. Probá Chrome o Edge.");
      return;
    }
    rec.lang = "es-AR";
    rec.continuous = false;
    rec.interimResults = true;
    rec.onresult = (event) => {
      const last = event.results[event.results.length - 1];
      setTranscript(last[0]?.transcript ?? "");
    };
    rec.onerror = (event) => {
      setError(event.error);
      setListening(false);
    };
    rec.onend = () => setListening(false);
    recRef.current = rec;
    rec.start();
    setListening(true);
  }, []);

  const toggle = useCallback(() => {
    if (listening) stop();
    else start();
  }, [listening, start, stop]);

  return { supported, listening, transcript, error, start, stop, toggle, setTranscript };
}
