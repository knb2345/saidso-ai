'use client';

import { useSpeech } from '../useSpeech';

/**
 * Hold to talk, using the browser's own speech recognition.
 *
 * The brief does not ask for speech recognition, and the memory system does not depend on
 * it — the corpus is replayed as text. But this is a voice-first product, and the thing
 * worth feeling is how raw the recogniser's output is compared with what Saidso writes down.
 * The browser gives that for free where it is supported; elsewhere the textarea is the
 * same path, and everything downstream is identical either way.
 */
export default function Microphone({
  onTranscript,
  disabled,
}: {
  onTranscript: (text: string, final: boolean) => void;
  disabled?: boolean;
}) {
  const { supported, listening, error, toggle } = useSpeech({ onTranscript });

  if (!supported) {
    return (
      <div className="hint" style={{ textAlign: 'left', marginTop: 10 }}>
        This browser has no speech recognition — type what you would have said instead. Everything
        after this point is identical. (Chrome and Edge support it.)
      </div>
    );
  }

  return (
    <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 12 }}>
      <button
        className="pill"
        onClick={() => !disabled && toggle()}
        disabled={disabled}
        style={
          listening
            ? { background: 'var(--green)', color: 'var(--ink)', borderColor: 'var(--green)' }
            : undefined
        }
      >
        {listening ? '● listening — click to stop' : '🎙 speak instead of typing'}
      </button>
      {error && <span className="esrc">{error}</span>}
      {listening && <span className="esrc">say it the way you would say it</span>}
    </div>
  );
}
