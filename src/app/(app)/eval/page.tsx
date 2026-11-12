import fs from 'node:fs';
import path from 'node:path';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

/*
 * The evaluation, in the product. Every case went through the full pipeline — real
 * retrieval, real tools, real model — and is shown with what it expected, what came back,
 * and why it passed or failed. Failures first: they are the useful part.
 */

type Case = {
  id: string;
  group: string;
  question: string;
  why_this_case_exists: string;
  expected: Record<string, any>;
  passed: boolean;
  failures: string[];
  error: string | null;
  outcome: string;
  confidence?: string;
  answer: string;
  draft?: string | null;
  citations?: { memories: any[]; dictations: any[] };
  reasoning_trace?: { rounds: number; steps: { tool: string; args: any; ms: number; summary: string }[] };
  metrics?: { total_ms: number; retrieval_ms: number; input_tokens: number; output_tokens: number; cost_usd: number };
};

function load(file = 'results.json'): any | null {
  try {
    return JSON.parse(fs.readFileSync(path.join(process.cwd(), 'eval', 'results', file), 'utf8'));
  } catch {
    return null;
  }
}

type Variant = {
  name: string;
  passed: number;
  total: number;
  p50_ms: number;
  p90_ms: number;
  cost_per_question: number;
  failed: string[];
};

function Ablation({ a }: { a: { question: string; how: string; finding: string; variants: Variant[] } }) {
  const all = [...new Set(a.variants.flatMap((v) => v.failed))];
  return (
    <>
      <h2>Ablation: {a.question}</h2>
      <p className="lede" style={{ marginBottom: 14 }}>
        {a.finding}
      </p>
      <table className="cands ablation">
        <thead>
          <tr>
            <th>variant</th>
            <th className="num">passed</th>
            <th className="num">p50</th>
            <th className="num">p90</th>
            <th className="num">$ / question</th>
            <th>failed cases</th>
          </tr>
        </thead>
        <tbody>
          {a.variants.map((v) => (
            <tr key={v.name}>
              <td className="used">{v.name}</td>
              <td className="num used">
                {v.passed}/{v.total}
              </td>
              <td className="num">{(v.p50_ms / 1000).toFixed(1)}s</td>
              <td className="num">{(v.p90_ms / 1000).toFixed(1)}s</td>
              <td className="num">{v.cost_per_question.toFixed(4)}</td>
              <td>
                {all.map((id) => (
                  <span key={id} className={v.failed.includes(id) ? 'warn' : 'esrc'} style={{ marginRight: 10 }}>
                    {v.failed.includes(id) ? '✕' : '✓'} {id}
                  </span>
                ))}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="esrc" style={{ marginTop: 8 }}>
        Reproduce: <code>{a.how}</code>
      </p>
    </>
  );
}

const GROUP_NOTE: Record<string, string> = {
  supersession: 'a fact that changed — answer with the new one, keep the old as history',
  preference: 'how the person asked for things to be written',
  flagship: 'find by time and app, then rewrite to stored preferences',
  aggregation: 'one story spread across several dictations',
  fact: 'single durable facts: owners, dates, numbers',
  recency: 'the latest state of something that moved',
  abstention: 'never said — must decline, not invent',
  privacy: 'health, money, family, credentials — never learned',
  clarification: 'ambiguous — ask one question instead of guessing',
  episodic: 'what happened when, and where it was sent',
  control: 'teach or correct the memory by talking to it',
  honesty: 'grounded in history is not the same as true',
};

function describeExpected(e: Record<string, any>): string {
  const parts: string[] = [];
  if (e.outcome) parts.push(`outcome ${Array.isArray(e.outcome) ? e.outcome.join(' or ') : e.outcome}`);
  if (e.any_of) parts.push(`mentions any of: ${e.any_of.join(' | ')}`);
  if (e.none_of) parts.push(`never mentions: ${e.none_of.join(' | ')}`);
  if (e.cite_planted) parts.push(`cites the planted source “${e.cite_planted}”`);
  for (const [k, v] of Object.entries(e)) {
    if (['outcome', 'any_of', 'none_of', 'cite_planted'].includes(k)) continue;
    parts.push(`${k.replace(/_/g, ' ')}: ${typeof v === 'string' ? v : JSON.stringify(v)}`);
  }
  return parts.join(' · ');
}

export default function EvalPage() {
  const r = load();
  if (!r) {
    return (
      <div className="page">
        <h1>Evaluation</h1>
        <p className="lede">No evaluation results are bundled with this build. Run <code>npm run eval</code>.</p>
      </div>
    );
  }
  const s = r.summary;
  const ablation = load('ablation.json');
  const variance = load('variance.json');
  const cases: Case[] = [...r.cases].sort((a: Case, b: Case) => Number(a.passed) - Number(b.passed));
  const groups = Object.entries(s.cases.by_group as Record<string, { passed: number; total: number }>);

  return (
    <div className="page wide">
      <h1>Evaluation</h1>
      <p className="lede">
        {s.cases.total} questions and {s.memory_state.total} memory-state checks, run through the complete
        pipeline: real retrieval, real tools, real model, against the seeded corpus. About a third of the
        cases are ones where the right behaviour is to refuse or to not know. Failures are listed first.
        Any question can be asked again, live.
      </p>

      <div className="stats">
        <div className="stat">
          <div className="v">
            {s.cases.passed}/{s.cases.total}
          </div>
          <div className="l">question cases passed</div>
        </div>
        <div className="stat">
          <div className="v">
            {s.memory_state.passed}/{s.memory_state.total}
          </div>
          <div className="l">memory-state checks</div>
        </div>
        <div className="stat">
          <div className="v">{(s.latency_ms.retrieval_p50 / 1000).toFixed(1)}s</div>
          <div className="l">retrieval p50</div>
        </div>
        <div className="stat">
          <div className="v">${s.cost_usd.per_question.toFixed(4)}</div>
          <div className="l">model cost per question</div>
        </div>
        <div className="stat">
          <div className="v">{s.corpus.dictations}</div>
          <div className="l">dictations in the corpus</div>
        </div>
      </div>

      {variance && variance.runs.length > 1 && (
        <p className="esrc" style={{ margin: '-14px 0 22px' }}>
          Run to run: this configuration scored {variance.runs.map((r: any) => r.passed).join(', ')} of{' '}
          {s.cases.total} across {variance.runs.length} runs.{' '}
          {variance.always_fail.length > 0 && <>Failed every time: {variance.always_fail.join(', ')}. </>}
          {variance.flaky.length > 0 && <>Changed between runs: {variance.flaky.join(', ')}.</>}
        </p>
      )}

      <h2>By what each group tests</h2>
      <div className="egroups">
        {groups.map(([g, v]) => (
          <div key={g} className="egroup">
            <div className="egroup-top">
              <span className="egroup-name">{g}</span>
              <span className={v.passed === v.total ? 'ok' : 'warn'}>
                {v.passed}/{v.total}
              </span>
            </div>
            <div className="ebar">
              <i style={{ width: `${(v.passed / v.total) * 100}%` }} />
            </div>
            <div className="egroup-note">{GROUP_NOTE[g] ?? ''}</div>
          </div>
        ))}
      </div>

      {ablation && <Ablation a={ablation} />}

      <h2>Memory-state checks</h2>
      <div className="mstate">
        {r.memory_state.map((m: any) => (
          <div key={m.id} className={`mcheck ${m.passed ? 'ok' : 'warn'}`}>
            <span>{m.passed ? '✓' : '✕'}</span> {m.description}
          </div>
        ))}
      </div>

      <h2>Every case</h2>
      {cases.map((c) => (
        <details key={c.id} className={`trace ecase${c.passed ? '' : ' failed'}`} open={!c.passed}>
          <summary>
            <span>
              <span className={`epass ${c.passed ? 'ok' : 'warn'}`}>{c.passed ? 'pass' : 'fail'}</span>
              <span className="egroup-tag">{c.group}</span>
              {c.question}
            </span>
            <span className="kv" style={{ whiteSpace: 'nowrap' }}>
              {c.outcome}
              {c.metrics ? ` · ${(c.metrics.total_ms / 1000).toFixed(1)}s` : ''}
            </span>
          </summary>
          <div className="body">
            <div className="ewhy">{c.why_this_case_exists}</div>
            <div className="erow">
              <div className="elabel">expected</div>
              <div className="kv">{describeExpected(c.expected)}</div>
            </div>
            <div className="erow">
              <div className="elabel">answer</div>
              <div>{c.answer || <em className="esrc">no answer</em>}</div>
            </div>
            {c.draft && (
              <div className="erow">
                <div className="elabel">draft</div>
                <div style={{ whiteSpace: 'pre-wrap' }}>{c.draft}</div>
              </div>
            )}
            {c.failures.length > 0 && (
              <div className="erow">
                <div className="elabel">why it failed</div>
                <div>
                  {c.failures.map((f, i) => (
                    <div key={i} className="efail">
                      {f}
                    </div>
                  ))}
                </div>
              </div>
            )}
            {c.reasoning_trace && (
              <div className="erow">
                <div className="elabel">tools</div>
                <div className="kv">
                  {c.reasoning_trace.steps.map((st) => st.tool).join(' → ') || 'none'} · {c.reasoning_trace.rounds}{' '}
                  model rounds
                  {c.metrics ? ` · ${c.metrics.input_tokens} in / ${c.metrics.output_tokens} out tokens · $${c.metrics.cost_usd.toFixed(5)}` : ''}
                </div>
              </div>
            )}
            {c.citations && c.citations.memories.length + c.citations.dictations.length > 0 && (
              <div className="erow">
                <div className="elabel">cited</div>
                <div className="chips">
                  {c.citations.memories.map((m: any) => (
                    <span key={m.id} className={`chip kind-${m.kind}`}>
                      {m.statement}
                    </span>
                  ))}
                  {c.citations.dictations.map((d: any) => (
                    <span key={d.id} className="chip dictation">
                      {d.app} · {d.id}
                    </span>
                  ))}
                </div>
              </div>
            )}
            <Link className="linkish" href={`/ask?q=${encodeURIComponent(c.question)}`}>
              ask this again, live →
            </Link>
          </div>
        </details>
      ))}

      <p className="esrc" style={{ marginTop: 24 }}>
        Run {new Date(s.ran_at).toUTCString()} · chat {s.models.chat} · extraction {s.models.extract} · embeddings{' '}
        {s.models.embed}. Dates in answers are as of that run; the live demo re-dates its corpus every day.
        Reproduce with <code>npm run eval</code>.
      </p>
    </div>
  );
}
