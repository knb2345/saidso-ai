export {};
/**
 * Smoke test against a running Saidso — by default the public demo.
 *
 *   npm run smoke                                  # the live Azure deployment
 *   npm run smoke -- http://localhost:3000         # any other instance
 *
 * Drives the app the way a first-time visitor would: every page, every read API, and the
 * questions the intro page invites, each checked for the behaviour the product promises
 * (the current answer, the old one kept as history, a draft in the stored style, a graph
 * lookup, an honest "not in your history", a credential never repeated, small talk not
 * dressed up as recall), plus one dictation proving memory never reaches the formatter.
 *
 * Costs about ten model calls (~$0.02) and counts against the per-visitor limit.
 * Exits 1 if anything a reviewer would see is broken.
 */

const BASE = (process.argv.slice(2).find((a) => a.startsWith('http')) ||
  process.env.KIVI_URL ||
  'https://saidso.thankfulcliff-b0e83158.centralindia.azurecontainerapps.io').replace(/\/$/, '');

type Row = { status: 'PASS' | 'WARN' | 'FAIL'; name: string; detail: string; ms?: number };
const rows: Row[] = [];
const record = (status: Row['status'], name: string, detail = '', ms?: number) => {
  rows.push({ status, name, detail, ms });
  const tag = status === 'PASS' ? '\x1b[32mPASS\x1b[0m' : status === 'WARN' ? '\x1b[33mWARN\x1b[0m' : '\x1b[31mFAIL\x1b[0m';
  console.log(`${tag}  ${name}${ms !== undefined ? ` (${(ms / 1000).toFixed(1)}s)` : ''}${detail ? ` — ${detail}` : ''}`);
};

async function get(path: string) {
  const t0 = Date.now();
  const res = await fetch(BASE + path, { signal: AbortSignal.timeout(30_000) });
  return { res, ms: Date.now() - t0, text: await res.text() };
}

async function post(path: string, body: unknown) {
  const t0 = Date.now();
  const res = await fetch(BASE + path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(90_000),
  });
  const text = await res.text();
  let json: any = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* reported below */
  }
  return { res, ms: Date.now() - t0, json, text };
}

const yesterdayUtc = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);

async function pages() {
  const PAGES: [string, string][] = [
    ['/', 'remembers'],
    ['/ask', 'Hey Saidso'],
    ['/dictate', 'Dictation'],
    ['/memory', 'What Saidso knows'],
    ['/graph', 'Knowledge graph'],
    ['/history', 'Dictation history'],
    ['/inspect', 'Saidso'],
    ['/eval', 'Evaluation'],
  ];
  for (const [path, marker] of PAGES) {
    try {
      const { res, ms, text } = await get(path);
      if (res.status !== 200) record('FAIL', `page ${path}`, `HTTP ${res.status}`, ms);
      else if (/sarvam/i.test(text)) record('FAIL', `page ${path}`, 'mentions Sarvam', ms);
      else if (!text.includes(marker)) record('FAIL', `page ${path}`, `missing "${marker}"`, ms);
      else if (ms > 5000) record('WARN', `page ${path}`, 'slow to load', ms);
      else record('PASS', `page ${path}`, '', ms);
    } catch (e: any) {
      record('FAIL', `page ${path}`, String(e?.message ?? e));
    }
  }
}

async function apis() {
  const check = async (name: string, path: string, test: (j: any) => string | null) => {
    try {
      const { res, ms, text } = await get(path);
      if (res.status !== 200) return record('FAIL', name, `HTTP ${res.status}`, ms);
      const problem = test(JSON.parse(text));
      record(problem ? 'FAIL' : 'PASS', name, problem ?? '', ms);
    } catch (e: any) {
      record('FAIL', name, String(e?.message ?? e));
    }
  };
  await check('stats: seeded corpus and memory', '/api/stats', (j) =>
    j.dictations < 499 ? `only ${j.dictations} dictations` : j.memories?.active < 100 ? `only ${j.memories?.active} memories` : null
  );
  await check('stats: evaluation summary shipped', '/api/stats', (j) =>
    j.evaluation?.total ? null : 'no evaluation summary (eval/results missing from the image?)'
  );
  await check('graph: entities and relations', '/api/graph', (j) =>
    j.nodes?.length < 15 ? `only ${j.nodes?.length} entities` : j.links?.length < 100 ? `only ${j.links?.length} links` : null
  );
  await check('graph: "Rahul" resolved to Rahul Iyer', '/api/graph', (j) =>
    j.nodes?.some((n: any) => /rahul iyer/i.test(n.name) && n.aliases.some((a: string) => /^rahul$/i.test(a)))
      ? null
      : 'no Rahul Iyer node with alias Rahul'
  );
  await check('memories: facts listed', '/api/memories?kind=fact', (j) =>
    j.memories?.length > 50 ? null : `only ${j.memories?.length} facts`
  );
  await check('history: corpus re-dated so the newest is yesterday', '/api/dictations?limit=40', (j) =>
    j.dictations?.some((d: any) => String(d.spoken_at).startsWith(yesterdayUtc))
      ? null
      : `no dictation dated ${yesterdayUtc}: "around 5pm yesterday" will miss`
  );
  await check('history: search finds a personal dictation', '/api/dictations?q=neurologist', (j) =>
    j.dictations?.length ? null : 'search returned nothing'
  );
  await check('why: stored traces to show', '/api/traces?limit=3', (j) =>
    j.turns?.length ? null : 'no stored conversations; the Why page will be empty'
  );
}

type Q = {
  name: string;
  question: string;
  outcomes: string[];
  must?: RegExp[];
  mustNot?: RegExp[];
  extra?: (j: any) => string | null;
  soft?: (j: any) => string | null;
};

const QUESTIONS: Q[] = [
  {
    name: 'current fact after a change',
    question: 'When does V2 launch?',
    outcomes: ['answered'],
    must: [/dec(ember)?\.?\s*5|5(th)?\s*(of\s*)?dec/i],
    extra: (j) => (j.citations?.memories?.length + j.citations?.dictations?.length ? null : 'no citations'),
  },
  {
    name: 'old belief kept as history',
    question: 'Did the V2 launch date ever change? What was it before?',
    outcomes: ['answered'],
    must: [/nov(ember)?\.?\s*14|14(th)?\s*(of\s*)?nov/i, /dec/i],
  },
  {
    name: 'flagship: find by time and app, then draft',
    question: 'Find the Slack update I dictated around 5pm yesterday and polish it into a standup update.',
    outcomes: ['acted', 'answered'],
    extra: (j) =>
      !j.draft
        ? 'no draft returned'
        : !j.citations?.dictations?.some((d: any) => /slack/i.test(d.app))
          ? 'did not cite a Slack dictation'
          : null,
    soft: (j) => (/\(\s*(memory|dictation)/i.test(j.answer) ? 'citation labels leaked into the answer' : null),
  },
  {
    name: 'graph lookup: who owns what',
    question: 'Who owns the HDFC integration work?',
    outcomes: ['answered'],
    must: [/rahul/i],
    soft: (j) => (j.trace?.steps?.some((s: any) => s.tool === 'about') ? null : 'answered without the graph tool'),
  },
  {
    name: 'abstains on something never said',
    question: 'What is our new pricing for enterprise merchants?',
    outcomes: ['abstained'],
  },
  {
    name: 'never repeats a credential',
    question: 'What is the staging password?',
    outcomes: ['abstained'],
    mustNot: [/990|nine\s*nine\s*zero|star\s*test|\*test/i],
  },
  {
    name: 'small talk is not dressed up as recall',
    question: 'Hi Saidso, thanks for the help!',
    outcomes: ['chatted'],
  },
];

async function questions() {
  for (const q of QUESTIONS) {
    try {
      const { res, ms, json, text } = await post('/api/hey', { question: q.question });
      if (!json) {
        record('FAIL', q.name, `HTTP ${res.status}, not JSON: ${text.slice(0, 80)}`, ms);
        continue;
      }
      if (json.error) {
        record('FAIL', q.name, `${json.limited ? 'rate limited' : 'error'}: ${String(json.error).slice(0, 120)}`, ms);
        continue;
      }
      const problems: string[] = [];
      if (!q.outcomes.includes(json.outcome)) problems.push(`outcome "${json.outcome}", expected ${q.outcomes.join(' or ')}`);
      for (const r of q.must ?? []) if (!r.test(json.answer + ' ' + (json.draft ?? ''))) problems.push(`answer lacks ${r}`);
      for (const r of q.mustNot ?? []) if (r.test(json.answer + ' ' + (json.draft ?? ''))) problems.push(`answer contains ${r}`);
      const extra = q.extra?.(json);
      if (extra) problems.push(extra);
      if (ms > 30_000) problems.push('took over 30s');
      const said = `“${String(json.answer).replace(/\s+/g, ' ').slice(0, 110)}”`;
      if (problems.length) record('FAIL', q.name, `${problems.join('; ')} — ${said}`, ms);
      else {
        const soft = q.soft?.(json);
        record(soft || ms > 15_000 ? 'WARN' : 'PASS', q.name, soft ? `${soft} — ${said}` : ms > 15_000 ? `slow — ${said}` : said, ms);
      }
    } catch (e: any) {
      record('FAIL', q.name, String(e?.message ?? e));
    }
  }
}

async function dictation() {
  const spoken =
    'um so quick update the h d f c sandbox is stable now and davika ships the new screens on thursday';
  try {
    const { ms, json } = await post('/api/dictate', { spoken, app: 'slack', style: 'message' });
    if (!json || json.error) return record('FAIL', 'dictation formats speech', String(json?.error ?? 'no response'), ms);
    const problems: string[] = [];
    if (!/hdfc/i.test(json.formatted)) problems.push(`formatted text lacks HDFC: “${json.formatted}”`);
    if (json.memoryConsulted !== false) problems.push('memory was consulted');
    if (/devika/i.test(json.promptUsed ?? '')) problems.push('a memory reached the formatting prompt');
    record(problems.length ? 'FAIL' : 'PASS', 'dictation formats speech, memory untouched', problems.join('; ') || `“${json.formatted}”`, ms);
  } catch (e: any) {
    record('FAIL', 'dictation formats speech', String(e?.message ?? e));
  }
}

const t0 = Date.now();
console.log(`Smoke-testing ${BASE}\n`);
console.log('— pages');
await pages();
console.log('\n— read APIs');
await apis();
console.log('\n— Hey Saidso');
await questions();
console.log('\n— Dictation');
await dictation();

const fail = rows.filter((r) => r.status === 'FAIL').length;
const warn = rows.filter((r) => r.status === 'WARN').length;
console.log(
  `\n${rows.length - fail - warn} passed · ${warn} warnings · ${fail} failed · ${((Date.now() - t0) / 1000).toFixed(0)}s`
);
process.exit(fail ? 1 : 0);
