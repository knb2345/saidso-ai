'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * The browser's own speech recognition (Chrome, Edge), shared by Dictation and Hey Kivi.
 *
 * `onTranscript` streams the running transcript — settled words plus whatever the
 * recogniser currently believes — so the box shows exactly what it heard. `onEnd` fires
 * once when listening stops with something heard and no error, which is how Hey Kivi sends
 * a spoken question without a second click.
 */
export function useSpeech(opts: {
  onTranscript: (text: string, final: boolean) => void;
  onEnd?: (text: string) => void;
  lang?: string;
}) {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recognition = useRef<any>(null);
  const baseline = useRef('');
  const latest = useRef('');
  const failed = useRef(false);
  // Callbacks change every render; the recogniser is built once and reads them from here.
  const callbacks = useRef(opts);
  useEffect(() => {
    callbacks.current = opts;
  });

  useEffect(() => {
    const Recognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!Recognition) return;
    setSupported(true);

    const r = new Recognition();
    r.continuous = true;
    r.interimResults = true;
    r.lang = callbacks.current.lang ?? 'en-IN';

    r.onresult = (event: any) => {
      let interim = '';
      let settled = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const chunk = event.results[i][0].transcript;
        if (event.results[i].isFinal) settled += chunk;
        else interim += chunk;
      }
      if (settled) baseline.current = `${baseline.current} ${settled}`.trim();
      latest.current = `${baseline.current} ${interim}`.trim();
      callbacks.current.onTranscript(latest.current, Boolean(settled));
    };
    r.onerror = (e: any) => {
      if (e.error === 'aborted') return;
      failed.current = true;
      setError(
        e.error === 'not-allowed' || e.error === 'service-not-allowed'
          ? 'microphone permission was refused'
          : e.error === 'no-speech'
            ? 'nothing was heard — try again'
            : `speech recognition failed: ${e.error}`
      );
    };
    r.onend = () => {
      setListening(false);
      const heard = latest.current.trim();
      if (heard && !failed.current) callbacks.current.onEnd?.(heard);
    };
    recognition.current = r;

    return () => {
      r.onend = null;
      try {
        r.abort();
      } catch {
        /* already stopped */
      }
    };
  }, []);

  const start = useCallback(() => {
    if (!recognition.current) return;
    setError(null);
    failed.current = false;
    baseline.current = '';
    latest.current = '';
    try {
      recognition.current.start();
      setListening(true);
    } catch {
      /* start() throws if it is already running */
    }
  }, []);

  const stop = useCallback(() => {
    try {
      recognition.current?.stop();
    } catch {
      /* already stopped */
    }
  }, []);

  const toggle = useCallback(() => (listening ? stop() : start()), [listening, start, stop]);

  return { supported, listening, error, start, stop, toggle };
}
