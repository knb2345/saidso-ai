'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import './landing.css';

/*
 * The intro page. Someone arriving from a link gets the idea in fifteen seconds — a replay
 * of real records from the seeded corpus being kept, replaced or refused, then a question
 * answered from them — before they are handed the product itself at /ask.
 */

type Verdict = 'fact' | 'preference' | 'supersede' | 'refuse';

type Scene =
  | {
      type: 'dictation';
      app: string;
      where: string;
      raw: string;
      verdict: Verdict;
      memory: string;
      note: string;
      replaces?: number;
    }
  | { type: 'ask'; q: string; a: string; outcome: 'answered' | 'abstained'; chips: string[] };

// Lightly trimmed from corpus/dictations.jsonl (d_00091, d_00069, d_00214, d_00348, d_00353).
const SCENES: Scene[] = [
  {
    type: 'dictation',
    app: 'slack',
    where: '#product-team',
    raw: 'hey team um so just wanted to update you all that the merchant onboarding v two launch date is officially locked for the 14th of november',
    verdict: 'fact',
    memory: 'Merchant onboarding V2 launches on November 14.',
    note: 'a date someone will ask about again',
  },
  {
    type: 'dictation',
    app: 'slack',
    where: '#product-team',
    raw: 'hey team from now on can we make sure every standup update is written as three short bullets with no paragraphs and no greeting at the top please',
    verdict: 'preference',
    memory: 'Standup updates: three short bullets, no greeting.',
    note: 'a rule for how she likes things written',
  },
  {
    type: 'dictation',
    app: 'whatsapp',
    where: 'message to sister',
    raw: 'hey di um my migraine came back so badly today … i managed to book a neurologist appointment for friday morning',
    verdict: 'refuse',
    memory: 'A health message',
    note: 'health is private: still findable in her messages, never learned',
  },
  {
    type: 'dictation',
    app: 'slack',
    where: 'V2 launch delay',
    raw: 'hey team um the h d f c sandbox slipped again so we are officially pushing the v two launch to the 5th of december and this is final',
    verdict: 'supersede',
    memory: 'Merchant onboarding V2 launches on December 5.',
    note: 'the date changed: November 14 is kept as history',
    replaces: 0,
  },
  {
    type: 'dictation',
    app: 'notes',
    where: 'note to self',
    raw: 'um the staging password is •••••••••• let me just write it down so i don’t forget',
    verdict: 'refuse',
    memory: 'A password',
    note: 'a password: never learned, never repeated back',
  },
  {
    type: 'ask',
    q: 'When does V2 launch?',
    a: 'December 5th. You moved it from November 14th when the HDFC sandbox slipped again.',
    outcome: 'answered',
    chips: ['said · slack · V2 launch delay', 'was · November 14'],
  },
  {
    type: 'ask',
    q: 'What is our new pricing for enterprise merchants?',
    a: 'You have never dictated anything about enterprise pricing, so I will not guess.',
    outcome: 'abstained',
    chips: [],
  },
];

// Timeline, in milliseconds. Everything on screen is derived from one clock.
const TYPE_MS = 19;
const VERDICT_HOLD = 1500;
const Q_TYPE_MS = 42;
const THINK_MS = 1000;
const ANSWER_HOLD = 3600;
const END_HOLD = 2200;

function sceneLength(s: Scene) {
  if (s.type === 'dictation') return s.raw.length * TYPE_MS + VERDICT_HOLD;
  return s.q.length * Q_TYPE_MS + THINK_MS + ANSWER_HOLD;
}
const STARTS = SCENES.reduce<number[]>((acc, s, i) => {
  acc.push(i === 0 ? 0 : acc[i - 1] + sceneLength(SCENES[i - 1]));
  return acc;
}, []);
const LOOP = STARTS[STARTS.length - 1] + sceneLength(SCENES[SCENES.length - 1]) + END_HOLD;
// What a reduced-motion visitor sees: the ledger complete and the first question answered.
const STILL = STARTS[5] + sceneLength(SCENES[5]) - 10;

type Frame = {
  index: number;
  typed: number;
  phase: 'typing' | 'verdict' | 'thinking' | 'answer';
  ledger: { scene: number; superseded: boolean }[];
  ask: { scene: number; typed: number; phase: 'typing' | 'thinking' | 'answer' } | null;
};

function frameAt(t: number): Frame {
  let index = 0;
  for (let i = 0; i < SCENES.length; i++) if (t >= STARTS[i]) index = i;
  const s = SCENES[index];
  const local = t - STARTS[index];

  let typed = 0;
  let phase: Frame['phase'] = 'typing';
  if (s.type === 'dictation') {
    typed = Math.min(s.raw.length, Math.floor(local / TYPE_MS));
    phase = typed >= s.raw.length ? 'verdict' : 'typing';
  } else {
    const typing = s.q.length * Q_TYPE_MS;
    typed = Math.min(s.q.length, Math.floor(local / Q_TYPE_MS));
    phase = local < typing ? 'typing' : local < typing + THINK_MS ? 'thinking' : 'answer';
  }

  const ledger: Frame['ledger'] = [];
  for (let j = 0; j < SCENES.length; j++) {
    const sj = SCENES[j];
    if (sj.type !== 'dictation') continue;
    const shown = j < index || (j === index && phase === 'verdict');
    if (!shown) continue;
    ledger.push({ scene: j, superseded: false });
    if (sj.replaces !== undefined) {
      const old = ledger.find((l) => l.scene === sj.replaces);
      if (old) old.superseded = true;
    }
  }

  let ask: Frame['ask'] = null;
  if (s.type === 'ask') ask = { scene: index, typed, phase: phase as 'typing' | 'thinking' | 'answer' };

  return { index, typed, phase, ledger, ask };
}

function useClock() {
  const [t, setT] = useState(0);
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setT(STILL);
      return;
    }
    let raf = 0;
    let last = 0;
    const start = performance.now();
    const tick = (now: number) => {
      // ~30 fps is plenty for typing, and keeps the page light.
      if (now - last > 33) {
        last = now;
        setT((now - start) % LOOP);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
  return t;
}

const VERDICT_LABEL: Record<Verdict, string> = {
  fact: 'remembered',
  preference: 'remembered',
  supersede: 'updated',
  refuse: 'not remembered',
};

function Replay() {
  const t = useClock();
  const f = frameAt(t);
  const scene = SCENES[f.index];
  const listening = scene.type === 'dictation';
  // The last dictation stays on screen while Saidso is being asked.
  const lastDictation = listening
    ? f.index
    : (SCENES.map((s, i) => (s.type === 'dictation' ? i : -1)).filter((i) => i >= 0).pop() as number);
  const d = SCENES[lastDictation] as Extract<Scene, { type: 'dictation' }>;
  const dTyped = listening ? f.typed : d.raw.length;
  const dVerdict = !listening || f.phase === 'verdict';
  const fadingOut = t > LOOP - 500;

  return (
    <div className={`lp-replay${fadingOut ? ' out' : ''}`} aria-label="A replay of Saidso learning from dictations">
      <div className="lp-replay-bar">
        <span className="lp-dots">
          <i />
          <i />
          <i />
        </span>
        <span>replay · messages from the demo</span>
      </div>

      <div className="lp-pane">
        <div className="lp-pane-head">
          <span>
            <b>1 · Ananya says</b> · into {d.app}, {d.where}
          </span>
          <span className={`lp-wave${listening && f.phase === 'typing' ? ' on' : ''}`} aria-hidden>
            {Array.from({ length: 14 }).map((_, i) => (
              <i key={i} style={{ animationDelay: `${-((i * 137) % 900)}ms` }} />
            ))}
          </span>
        </div>
        <div className="lp-raw">
          {d.raw.slice(0, dTyped)}
          {listening && f.phase === 'typing' && <span className="lp-caret" />}
        </div>
        {/* Keyed per message: reusing one element faded the old verdict out while already
            showing the next message's text. */}
        <div key={lastDictation} className={`lp-verdict v-${d.verdict}${dVerdict ? ' show' : ''}`}>
          <span className="lp-vtag">{VERDICT_LABEL[d.verdict]}</span>
          {d.note}
        </div>
      </div>

      <div className="lp-pane">
        <div className="lp-pane-head">
          <span>
            <b>2 · What Saidso remembers</b>
          </span>
          <span className="lp-count">{f.ledger.filter((l) => SCENES[l.scene].type === 'dictation' && (SCENES[l.scene] as any).verdict !== 'refuse' && !l.superseded).length} kept</span>
        </div>
        <div className="lp-ledger">
          {f.ledger.length === 0 && <div className="lp-empty">listening…</div>}
          {f.ledger.map((l) => {
            const s = SCENES[l.scene] as Extract<Scene, { type: 'dictation' }>;
            return (
              <div key={l.scene} className={`lp-mem v-${s.verdict}${l.superseded ? ' old' : ''}`}>
                <span className="lp-mkind">
                  {s.verdict === 'refuse' ? '✕' : l.superseded ? 'outdated' : s.verdict === 'preference' ? 'her style' : 'fact'}
                </span>
                <span className="lp-mtext">
                  {s.verdict === 'refuse' ? `${s.memory} — ignored` : s.memory}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="lp-pane lp-askpane">
        <div className="lp-pane-head">
          <span>
            <b>3 · Later, she asks Saidso</b>
          </span>
        </div>
        {!f.ask ? (
          <div className="lp-empty">A question is coming, once Saidso has listened…</div>
        ) : (
          (() => {
            const a = SCENES[f.ask.scene] as Extract<Scene, { type: 'ask' }>;
            return (
              <div className="lp-qa">
                <div className="lp-q">
                  {a.q.slice(0, f.ask.typed)}
                  {f.ask.phase === 'typing' && <span className="lp-caret" />}
                </div>
                {f.ask.phase === 'thinking' && (
                  <div className="lp-thinking">
                    <span className="pulse" /> looking through her messages…
                  </div>
                )}
                {f.ask.phase === 'answer' && (
                  <div className="lp-a">
                    <div className={`lp-outcome ${a.outcome}`}>
                      <span className="dot" />
                      {a.outcome === 'answered' ? 'answered from her messages' : 'she never said this'}
                    </div>
                    <div className="lp-atext">{a.a}</div>
                    {a.chips.length > 0 && (
                      <div className="lp-chips">
                        {a.chips.map((c) => (
                          <span key={c} className="lp-chip">
                            {c}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })()
        )}
      </div>
    </div>
  );
}

type Stats = {
  dictations: number;
  evaluation: { passed: number; total: number; runs: number[]; memoryPassed: number; memoryTotal: number; costPerQuestion: number; p50Ms: number } | null;
  memories: { fact: number; preference: number; superseded: number };
  decisions: { decision: string; c: number }[];
};

function useStats() {
  const [s, setS] = useState<Stats | null>(null);
  useEffect(() => {
    fetch('/api/stats')
      .then((r) => r.json())
      .then(setS)
      .catch(() => {});
  }, []);
  return s;
}

function Numbers({ s }: { s: Stats | null }) {
  const rejected = s?.decisions.find((d) => d.decision === 'rejected')?.c;
  const items = [
    { v: s?.dictations, l: 'dictations read, every one kept whole' },
    { v: s ? s.memories.fact + s.memories.preference : undefined, l: 'facts and preferences worth keeping' },
    { v: rejected, l: 'candidates it deliberately chose not to learn' },
    { v: s?.memories.superseded, l: 'beliefs it changed — the old ones kept as history' },
  ];
  const e = s?.evaluation;
  return (
    <>
    <div className="lp-stats">
      {items.map((i) => (
        <div className="lp-stat" key={i.l}>
          <div className="lp-stat-v">{i.v ?? '—'}</div>
          <div className="lp-stat-l">{i.l}</div>
        </div>
      ))}
    </div>
    {e && (
      <div className="lp-eval">
        <span>
          <b>
            {Math.min(...e.runs) === Math.max(...e.runs)
              ? e.passed
              : `${Math.min(...e.runs)}–${Math.max(...e.runs)}`}{' '}
            / {e.total}
          </b>{' '}
          evaluation questions passed{e.runs.length > 1 ? `, across ${e.runs.length} runs` : ''}
        </span>
        <span>
          <b>
            {e.memoryPassed} / {e.memoryTotal}
          </b>{' '}
          privacy and memory-state checks
        </span>
        <span>
          <b>{(e.p50Ms / 1000).toFixed(1)}s</b> median answer
        </span>
        <span>
          <b>${e.costPerQuestion.toFixed(4)}</b> per answer
        </span>
        <Link href="/eval" className="lp-eval-note">
          every case, failures included →
        </Link>
      </div>
    )}
    </>
  );
}

const TRY = [
  { q: 'When does V2 launch?', why: 'A date that changed halfway through four months of dictation.' },
  {
    q: 'Find the Slack update I dictated around 5pm yesterday and polish it into a standup update.',
    why: 'Found by time and app, then rewritten the way you once said you like it.',
  },
  { q: 'What happened with the Truvia KYC timeouts?', why: 'One story, told across three apps, weeks apart.' },
  { q: 'What is our new pricing for enterprise merchants?', why: 'Never mentioned. Watch it decline to make something up.' },
];

export default function Intro() {
  const stats = useStats();
  return (
    <div className="lp">
      <header className="lp-nav">
        <Link href="/" className="lp-logo">
          saids<span>o</span>
        </Link>
        <nav>
          <a href="#how">How it works</a>
          <a href="#trust">Privacy</a>
          <Link href="/graph">Graph</Link>
          <Link href="/eval">Evaluation</Link>
          <a href="https://github.com/knb2345/saidso-ai/tree/live-demo" target="_blank" rel="noreferrer">
            Code
          </a>
          <Link href="/ask" className="lp-btn small">
            Try it
          </Link>
        </nav>
      </header>

      <section className="lp-hero">
        <div className="lp-hero-copy">
          <div className="lp-eyebrow">
            <span className="lp-live" /> Saidso · live demo, no sign-up
          </div>
          <h1>
            The voice keyboard that <em>remembers your work</em>.
          </h1>
          <p className="lp-sub">
            Saidso is a dictation app: you speak, and it types your words into Slack, Gmail or any
            other app. It also remembers the work details you mention, like deadlines, decisions and
            who owns what, and deliberately ignores your health, money and passwords.
          </p>
          <p className="lp-sub2">
            Weeks later, just ask: “when is the launch?” It answers from your own messages and
            shows you which ones, or tells you honestly that you never said it.
          </p>
          <div className="lp-persona">
            <div className="lp-persona-k">Try it now, on a made-up example</div>
            <div>
              Meet <b>Ananya Rao</b>, an invented product manager whose team is launching a product
              called V2. Saidso holds <b>499 work messages</b> she spoke over four months. Ask a
              question the way she would and see which of her messages the answer came from. The
              answers are not scripted.
            </div>
          </div>
          <div className="lp-ctas">
            <Link href={`/ask?q=${encodeURIComponent('When does V2 launch?')}`} className="lp-btn">
              Ask it: “When does V2 launch?” <span aria-hidden>→</span>
            </Link>
            <Link href="/ask" className="lp-btn ghost">
              Ask your own question
            </Link>
          </div>
          <p className="lp-fine">No sign-up. Type your question, or say it out loud in Chrome or Edge.</p>
        </div>
        <div className="lp-hero-demo">
          <div className="lp-demo-cap">
            Watch it work (25 seconds): five of Ananya’s messages go in, Saidso decides what to remember, then she asks a question.
          </div>
          <Replay />
        </div>
      </section>

      <section className="lp-three" aria-label="How it works in three steps">
        <div className="lp-three-step">
          <div className="lp-three-n">1</div>
          <div>
            <h3>You speak</h3>
            <p className="lp-said">“um so the v two launch slipped to december fifth”</p>
            <p>Saidso types it into Slack, cleaned up, like any voice keyboard.</p>
          </div>
        </div>
        <div className="lp-three-step">
          <div className="lp-three-n">2</div>
          <div>
            <h3>Saidso keeps what matters</h3>
            <p className="lp-said">V2 launch: December 5 (was November 14)</p>
            <p>Dates, owners, decisions, how you like things written. Never small talk, health or passwords.</p>
          </div>
        </div>
        <div className="lp-three-step">
          <div className="lp-three-n">3</div>
          <div>
            <h3>Later, you just ask</h3>
            <p className="lp-said">“When does V2 launch?” → “December 5th.”</p>
            <p>With the exact message it came from, so you can check it yourself.</p>
          </div>
        </div>
      </section>

      <section className="lp-section" id="how">
        <div className="lp-kicker">How it works</div>
        <h2>Listening is easy. Knowing what to forget is the product.</h2>
        <div className="lp-steps">
          <div className="lp-step">
            <div className="lp-n">01</div>
            <h3>Keep everything</h3>
            <p>
              Every dictation is stored whole and searchable: what the recogniser heard, and what was
              actually sent. Nothing is summarised away.
            </p>
          </div>
          <div className="lp-step">
            <div className="lp-n">02</div>
            <h3>Learn very little</h3>
            <p>
              A model reads each dictation and promotes only what you would need again: dates,
              owners, decisions, numbers, and rules for how you write. A memory that cannot quote
              its source is dropped.
            </p>
          </div>
          <div className="lp-step">
            <div className="lp-n">03</div>
            <h3>Change its mind properly</h3>
            <p>
              When a later dictation contradicts an earlier one, the newer claim wins and the older
              one is kept as history, so Saidso can tell you what it used to believe and when that
              changed.
            </p>
          </div>
          <div className="lp-step">
            <div className="lp-n">04</div>
            <h3>Answer, or abstain</h3>
            <p>
              Hey Saidso is an agent with seven tools over that memory, including a walk over an entity
              graph where names are resolved across spellings. It can only speak through a call that
              carries its citations, and when nothing supports an answer, it says so.
            </p>
          </div>
        </div>

        <div className="lp-flow" aria-label="Pipeline">
          {[
            'speech',
            'dictation',
            'extract',
            'quote check',
            'reconcile',
            'memory',
            'entity graph',
            'vectors + BM25 + graph',
            'answer with citations',
          ].map((x, i, a) => (
            <span key={x} className="lp-flow-item">
              <span className={`lp-flow-chip${i === 0 || i === a.length - 1 ? ' end' : ''}`}>{x}</span>
              {i < a.length - 1 && <span className="lp-flow-arrow">→</span>}
            </span>
          ))}
        </div>
      </section>

      <section className="lp-section">
        <div className="lp-kicker">Measured, not claimed</div>
        <h2>Live from the database behind this page.</h2>
        <Numbers s={stats} />
      </section>

      <section className="lp-section">
        <div className="lp-kicker">Look inside</div>
        <h2>Nothing is a black box. Open any of it.</h2>
        <div className="lp-try lp-inside">
          <Link href="/graph" className="lp-trycard">
            <div className="lp-tryq">Knowledge graph</div>
            <div className="lp-trywhy">
              The people, systems and projects behind the memories, resolved across spellings
              (“Rahul” is Rahul Iyer), with every edge traced to the words that produced it.
            </div>
            <div className="lp-trygo">explore the graph →</div>
          </Link>
          <Link href="/memory" className="lp-trycard">
            <div className="lp-tryq">What Saidso knows</div>
            <div className="lp-trywhy">
              Every memory as a plain sentence, how often you said it, what it replaced, and a
              one-tap way to correct or forget it.
            </div>
            <div className="lp-trygo">read the memory →</div>
          </Link>
          <Link href="/eval" className="lp-trycard">
            <div className="lp-tryq">Evaluation</div>
            <div className="lp-trywhy">
              34 questions and 9 memory checks through the full pipeline, failures first, each one
              re-runnable live with a click.
            </div>
            <div className="lp-trygo">see the results →</div>
          </Link>
          <Link href="/inspect" className="lp-trycard">
            <div className="lp-tryq">Why it answered that</div>
            <div className="lp-trywhy">
              Retrieval candidates with vector and BM25 scores, every tool call, tokens and cost,
              for every answer it has given.
            </div>
            <div className="lp-trygo">inspect the traces →</div>
          </Link>
        </div>
      </section>

      <section className="lp-section" id="trust">
        <div className="lp-kicker">What it refuses to do</div>
        <h2>A memory you can trust has to say no.</h2>
        <div className="lp-refuse">
          <div>
            <h3>It won’t guess.</h3>
            <p>No source, no answer. “You never said that” is a first-class outcome, not a failure.</p>
          </div>
          <div>
            <h3>It won’t learn your private life.</h3>
            <p>
              Health, money, family, politics and colleagues’ private lives stay findable in your
              history and out of memory.
            </p>
          </div>
          <div>
            <h3>It won’t repeat a credential.</h3>
            <p>A password you dictate is never learned and never said back.</p>
          </div>
          <div>
            <h3>It won’t touch your dictation.</h3>
            <p>Memory feeds Hey Saidso only. The same sentence formats the same way next month.</p>
          </div>
          <div>
            <h3>It won’t hide its working.</h3>
            <p>
              Every memory shows the words it came from. Every answer shows its retrieval scores and
              its cost. Anything wrong is one tap from forgotten.
            </p>
          </div>
        </div>
      </section>

      <section className="lp-section">
        <div className="lp-kicker">Try it</div>
        <h2>Ask it yourself — typed, or out loud.</h2>
        <div className="lp-try">
          {TRY.map((x) => (
            <Link key={x.q} href={`/ask?q=${encodeURIComponent(x.q)}`} className="lp-trycard">
              <div className="lp-tryq">“{x.q}”</div>
              <div className="lp-trywhy">{x.why}</div>
              <div className="lp-trygo">ask this →</div>
            </Link>
          ))}
        </div>
        <div className="lp-final">
          <Link href="/ask" className="lp-btn">
            Open Saidso <span aria-hidden>→</span>
          </Link>
          <span className="lp-fine">
            Voice input works in Chrome and Edge. This is a shared demo: anything you teach it is
            reset every day.
          </span>
        </div>
      </section>

      <footer className="lp-foot">
        <span>
          saids<span className="g">o</span>
        </span>
        <span>Next.js · SQLite with FTS5 and vector search · Gemini</span>
        <a href="https://github.com/knb2345/saidso-ai/tree/live-demo" target="_blank" rel="noreferrer">
          Source on GitHub
        </a>
      </footer>
    </div>
  );
}
