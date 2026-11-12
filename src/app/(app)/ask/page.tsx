'use client';

import { useEffect, useRef, useState } from 'react';
import { useSpeech } from '../useSpeech';

type Citation = { id: string; kind?: string; statement?: string; formatted?: string; spoken_at?: string; app?: string };

type Turn = {
  role: 'user' | 'kivi';
  text: string;
  outcome?: 'answered' | 'abstained' | 'asked' | 'acted' | 'chatted' | string;
  confidence?: string;
  draft?: string;
  citations?: { memories: Citation[]; dictations: Citation[] };
  appliedPreferences?: { id: string; statement: string }[];
  confirm?: { memory_id: string; statement: string; why: string } | null;
  trace?: any;
  error?: string;
  settled?: 'confirmed' | 'forgotten';
};

const STARTERS = [
  'When does V2 launch?',
  'Find the Slack update I dictated around 5pm yesterday and polish it for the meeting I am walking into.',
  'What happened with the Truvia KYC timeouts?',
  'How do I like my standup updates written?',
  'What did we decide about UPI autopay, and why?',
  'What is our new pricing for enterprise merchants?',
];

/** An answer only earns the words "from your history" if something came out of it. */
function hasSources(t: Turn): boolean {
  return (t.citations?.memories.length ?? 0) + (t.citations?.dictations.length ?? 0) > 0;
}

export default function HeyKivi() {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [conversationId, setConversationId] = useState<string | undefined>();
  const [openTrace, setOpenTrace] = useState<number | null>(null);
  // Scoped to a turn: a bare id opened the same panel under every answer that happened
  // to carry citations, because this block renders inside the turn map.
  const [openCite, setOpenCite] = useState<{ turn: number; id: string } | null>(null);
  const isOpenCite = (turn: number, id: string) => openCite?.turn === turn && openCite?.id === id;
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [turns, busy]);

  // Ask out loud: the transcript streams into the box, and the question is sent the moment
  // listening stops — the same path as typing it, one click shorter.
  const speech = useSpeech({
    onTranscript: (text) => setInput(text),
    onEnd: (text) => ask(text),
  });

  // The intro page links here as /ask?q=… so a starter question runs on arrival. The URL is
  // cleaned afterwards, so a refresh does not ask it twice.
  const asked = useRef(false);
  useEffect(() => {
    if (asked.current) return;
    asked.current = true;
    const q = new URLSearchParams(window.location.search).get('q');
    if (q) {
      window.history.replaceState(null, '', '/ask');
      ask(q);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function ask(question: string) {
    if (!question.trim() || busy) return;
    setInput('');
    const history = turns.slice(-6).map((t) => ({ role: t.role, text: t.text }));
    setTurns((t) => [...t, { role: 'user', text: question }]);
    setBusy(true);
    try {
      const res = await fetch('/api/hey', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ question, conversationId, history }),
      });
      const data = await res.json();
      if (data.error) {
        const quota = !data.limited && /quota|429|exhausted/i.test(String(data.error));
        setTurns((t) => [
          ...t,
          {
            role: 'kivi',
            text: data.limited
              ? String(data.error)
              : quota
                ? 'I have run out of model quota for now, so I cannot look anything up. Everything already in your memory is still here to read.'
                : 'I could not reach the model just now. Nothing has been changed.',
            error: data.limited ? undefined : String(data.error).slice(0, 300),
          },
        ]);
      } else {
        setConversationId(data.conversationId);
        setTurns((t) => [...t, { role: 'kivi', ...data, text: data.answer }]);
      }
    } catch (e: any) {
      setTurns((t) => [...t, { role: 'kivi', text: 'Something went wrong.', error: String(e) }]);
    } finally {
      setBusy(false);
    }
  }

  async function settle(turnIndex: number, memoryId: string, action: 'confirm' | 'forget') {
    await fetch(`/api/memories/${memoryId}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action, reason: 'the person answered when Kivi asked mid-conversation' }),
    });
    setTurns((t) =>
      t.map((turn, i) =>
        i === turnIndex ? { ...turn, settled: action === 'confirm' ? 'confirmed' : 'forgotten' } : turn
      )
    );
  }

  async function forget(memoryId: string) {
    await fetch(`/api/memories/${memoryId}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'forget', reason: 'the person said this was wrong while talking to Hey Kivi' }),
    });
    setTurns((t) => [
      ...t,
      { role: 'kivi', text: 'Forgotten. I will not use that again, and I have kept a note of where it came from in case you want it back.' },
    ]);
  }

  return (
    <div className="page">
      {turns.length === 0 && (
        <>
          <h1>Hey Kivi</h1>
          <p className="lede">
            Ask about anything you have dictated. Kivi answers from your own history — and tells you when
            your history does not contain the answer.
          </p>
          <div className="starters">
            {STARTERS.map((s) => (
              <button key={s} className="starter" onClick={() => ask(s)}>
                {s}
              </button>
            ))}
          </div>
        </>
      )}

      <div className="thread">
        {turns.map((t, i) =>
          t.role === 'user' ? (
            <div className="bubble-user" key={i}>
              {t.text}
            </div>
          ) : (
            <div className="kivi-turn" key={i}>
              {t.outcome && (
                <div className="outcome">
                  <span className={`dot ${t.outcome}`} />
                  {t.outcome === 'answered' &&
                    (hasSources(t)
                      ? `from your history · ${t.confidence} confidence`
                      : 'answered without a source — treat with care')}
                  {t.outcome === 'abstained' && 'not in your history'}
                  {t.outcome === 'asked' && 'needs one detail'}
                  {t.outcome === 'acted' && 'done'}
                  {t.outcome === 'chatted' && 'just talking — nothing looked up'}
                </div>
              )}
              <div className={`kivi-answer${t.outcome === 'abstained' ? ' abstain' : ''}`}>{t.text}</div>

              {t.draft && (
                <>
                  <div className="draft">
                    <div className="draft-head">
                      <span>draft</span>
                      <button className="linkish" onClick={() => navigator.clipboard?.writeText(t.draft!)}>
                        copy
                      </button>
                    </div>
                    {t.draft}
                  </div>
                  {t.appliedPreferences && t.appliedPreferences.length > 0 && (
                    <div className="because">
                      <div className="because-head">
                        Written the way you asked for, {t.appliedPreferences.length}{' '}
                        {t.appliedPreferences.length === 1 ? 'thing' : 'things'} you have said before:
                      </div>
                      <div className="chips">
                        {t.appliedPreferences.map((p) => (
                          <button
                            key={p.id}
                            className="chip kind-preference"
                            onClick={() => setOpenCite(isOpenCite(i, p.id) ? null : { turn: i, id: p.id })}
                          >
                            {p.statement}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}

              {t.error && <div className="banner">{t.error}</div>}

              {t.citations && (t.citations.memories.length > 0 || t.citations.dictations.length > 0) && (
                <div className="because">
                  <div className="because-head">Because you said:</div>
                  <div className="chips">
                    {t.citations.memories.map((m) => (
                      <button
                        key={m.id}
                        className={`chip kind-${m.kind}`}
                        onClick={() => setOpenCite(isOpenCite(i, m.id) ? null : { turn: i, id: m.id })}
                      >
                        {m.statement}
                      </button>
                    ))}
                    {t.citations.dictations.map((d) => (
                      <button
                        key={d.id}
                        className="chip dictation"
                        onClick={() => setOpenCite(isOpenCite(i, d.id) ? null : { turn: i, id: d.id })}
                      >
                        {new Date(d.spoken_at!).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                        {d.app ? ` · ${d.app}` : ''}
                      </button>
                    ))}
                  </div>
                  {openCite?.turn === i && <CiteDetail id={openCite.id} onForget={forget} />}
                </div>
              )}

              {t.confirm && !t.settled && (
                <div className="checkin">
                  <div className="checkin-q">
                    Still right? <strong>{t.confirm.statement}</strong>
                  </div>
                  <div className="checkin-why">{t.confirm.why}</div>
                  <div className="mactions">
                    <button className="linkish" onClick={() => settle(i, t.confirm!.memory_id, 'confirm')}>
                      yes, that is right
                    </button>
                    <button className="linkish" onClick={() => settle(i, t.confirm!.memory_id, 'forget')}>
                      no — forget it
                    </button>
                  </div>
                </div>
              )}
              {t.settled && (
                <div className="checkin">
                  <div className="checkin-why">
                    {t.settled === 'confirmed'
                      ? 'Noted — Kivi will rely on that now.'
                      : 'Forgotten. Kivi will not use it again.'}
                  </div>
                </div>
              )}

              {t.trace && (
                <div className="turn-tools">
                  <button className="linkish" onClick={() => setOpenTrace(openTrace === i ? null : i)}>
                    {openTrace === i ? 'hide how Kivi got here' : 'how did Kivi get here?'}
                  </button>
                  <span style={{ fontSize: 11.5, color: 'var(--muted-2)' }}>
                    {(t.trace.totalMs / 1000).toFixed(1)}s · {t.trace.steps.length} lookups ·{' '}
                    ${t.trace.costUsd.toFixed(5)}
                  </span>
                </div>
              )}

              {openTrace === i && t.trace && <TraceView trace={t.trace} />}
            </div>
          )
        )}
        {busy && (
          <div className="thinking">
            <span className="pulse" /> looking through your history…
          </div>
        )}
        <div ref={endRef} />
      </div>

      <div className="composer">
        <div className={`composer-inner${speech.listening ? ' listening' : ''}`}>
          <textarea
            rows={1}
            value={input}
            placeholder={speech.listening ? 'Listening — ask out loud…' : 'Hey Kivi…'}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                // While listening, Enter means "that is my question": stopping sends it.
                if (speech.listening) speech.stop();
                else ask(input);
              }
            }}
          />
          {speech.supported && (
            <button
              className={`voice${speech.listening ? ' on' : ''}`}
              disabled={busy}
              onClick={speech.toggle}
              title={speech.listening ? 'Stop and send' : 'Ask out loud'}
              aria-label={speech.listening ? 'Stop listening and send' : 'Ask out loud'}
            >
              {speech.listening ? (
                <span className="voice-bars" aria-hidden>
                  <i />
                  <i />
                  <i />
                  <i />
                </span>
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
                  <rect x="9" y="3" width="6" height="11" rx="3" stroke="currentColor" strokeWidth="2" />
                  <path d="M5 11a7 7 0 0 0 14 0M12 18v3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
              )}
            </button>
          )}
          <button
            className="mic"
            disabled={busy || !input.trim()}
            onClick={() => (speech.listening ? speech.stop() : ask(input))}
            title="Send"
          >
            ↑
          </button>
        </div>
        <div className="hint">
          {speech.error
            ? speech.error
            : speech.listening
              ? 'Speak naturally. Tap the bars when you are done and Kivi sends it.'
              : speech.supported
                ? 'Type, or tap the mic and ask out loud. Dictation itself is unchanged — memory never touches it.'
                : 'Type your question. Voice input works in Chrome and Edge.'}
        </div>
      </div>
    </div>
  );
}

function CiteDetail({ id, onForget }: { id: string; onForget: (id: string) => void }) {
  /*
   * The fetched payload is stored WITH the id it belongs to.
   *
   * Clicking a second chip changes the `id` prop, and React re-renders before the effect
   * can refetch — so for one render the component held a memory response while `id` said
   * dictation, took the dictation branch, and read `.spoken_at` off undefined. That threw
   * a runtime error over the whole answer. Keying the payload to its id means a stale
   * response is simply never rendered.
   */
  const [state, setState] = useState<{ id: string; data: any } | null>(null);
  const isMemory = id.startsWith('m_');

  useEffect(() => {
    let cancelled = false;
    setState(null);
    fetch(isMemory ? `/api/memories/${id}` : `/api/dictations/${id}`)
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled) setState({ id, data });
      })
      .catch(() => {
        // A citation that cannot be loaded is worth saying plainly; it must never take
        // the answer down with it.
        if (!cancelled) setState({ id, data: { error: 'could not load this source' } });
      });
    // A slower earlier request must not overwrite the one the person is looking at.
    return () => {
      cancelled = true;
    };
  }, [id, isMemory]);

  if (!state || state.id !== id) return <div className="detail">loading…</div>;
  const data = state.data;
  if (!data || data.error) return <div className="detail">{data?.error ?? 'could not load this source'}</div>;

  if (isMemory) {
    if (!data.memory) return <div className="detail">this memory is no longer available</div>;
    return (
      <div className="detail">
        <div className="block">
          <h3>{data.memory.kind} · known since {String(data.memory.first_seen_at ?? '').slice(0, 10)}</h3>
          <div>{data.memory.statement}</div>
        </div>
        <div className="block">
          <h3>Where this came from</h3>
          {(data.evidence ?? []).map((e: any) => (
            <div key={e.dictation_id}>
              <div className="equote">
                <em>“{e.quote}”</em>
              </div>
              <div className="esrc">
                {new Date(e.spoken_at).toLocaleString()} · {e.app} · {e.dictation_id}
              </div>
            </div>
          ))}
          {(data.evidence ?? []).length === 0 && <div className="esrc">You told Kivi this directly.</div>}
        </div>
        <button className="linkish" onClick={() => onForget(id)}>
          this is wrong — forget it
        </button>
      </div>
    );
  }

  if (!data.dictation) return <div className="detail">this dictation is no longer available</div>;

  return (
    <div className="detail">
      <div className="block">
        <h3>
          {new Date(data.dictation.spoken_at).toLocaleString()} · {data.dictation.app}
        </h3>
        <div>{data.dictation.formatted}</div>
      </div>
      <div className="block">
        <h3>What you actually said</h3>
        <div className="raw">{data.dictation.raw_asr}</div>
      </div>
    </div>
  );
}

function TraceView({ trace }: { trace: any }) {
  return (
    <div className="detail">
      <div className="block">
        <h3>What Kivi did</h3>
        {trace.steps.map((s: any, i: number) => (
          <div className="step" key={i}>
            <div className="step-name">
              {s.tool}({Object.entries(s.args).map(([k, v]) => `${k}: ${JSON.stringify(v)}`).join(', ')})
            </div>
            <div className="kv">
              {s.summary} · {s.ms}ms
            </div>
            {s.candidates && s.candidates.length > 0 && (
              <table className="cands">
                <thead>
                  <tr>
                    <th>id</th>
                    <th>what</th>
                    <th className="num">score</th>
                    <th className="num">vector</th>
                    <th className="num">bm25</th>
                    <th>used</th>
                  </tr>
                </thead>
                <tbody>
                  {s.candidates.map((c: any) => (
                    <tr key={c.id}>
                      <td className={c.used ? 'used' : ''}>{c.id}</td>
                      <td className={c.used ? 'used' : ''}>{c.text.slice(0, 90)}</td>
                      <td className="num">{c.score}</td>
                      <td className="num">{c.vec}</td>
                      <td className="num">{c.bm25}</td>
                      <td>{c.used ? 'yes' : 'below floor'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        ))}
      </div>
      <div className="block">
        <h3>Cost of this answer</h3>
        <div className="kv">
          {trace.rounds} model rounds · {trace.inputTokens} in / {trace.outputTokens} out tokens ·
          retrieval {trace.retrievalMs}ms · model {trace.modelMs}ms · ${trace.costUsd.toFixed(6)}
        </div>
      </div>
      {trace.notes.length > 0 && (
        <div className="block">
          <h3>Warnings</h3>
          {trace.notes.map((n: string, i: number) => (
            <div className="kv" key={i}>
              {n}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
