import { config } from './config';
import { db, migrate } from './db';
import { generateJson } from './gemini';

/**
 * The entity graph.
 *
 * Memories are sentences, and the same person or system turns up in them under several
 * names — "Rahul", "Rahul Iyer", "Rahul's team"; "onboarding API", "Onboarding API v2".
 * The graph resolves those to one entity each and records who-does-what as
 * (subject, predicate, object) links, one memory per link.
 *
 * It is derived, never authoritative: a link is only as true as the memory it came from,
 * it inherits that memory's status (a superseded fact gives a superseded edge; a forgotten
 * one disappears), and it can be rebuilt from memory at any time.
 */

export const ENTITY_TYPES = ['person', 'team', 'organization', 'project', 'system', 'process', 'metric', 'other'] as const;
export type EntityType = (typeof ENTITY_TYPES)[number];

const ENTITY_SCHEMA = {
  type: 'object',
  properties: {
    entities: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          key: { type: 'string', description: 'short snake_case id, unique' },
          name: { type: 'string', description: 'the fullest canonical name used anywhere' },
          type: { type: 'string', enum: [...ENTITY_TYPES] },
          aliases: { type: 'array', items: { type: 'string' } },
          summary: { type: 'string', description: 'one short line: what or who this is, from the memories only' },
        },
        required: ['key', 'name', 'type', 'aliases', 'summary'],
      },
    },
  },
  required: ['entities'],
};

const LINK_SCHEMA = {
  type: 'object',
  properties: {
    links: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          memory_id: { type: 'string' },
          subject: { type: 'string', description: 'entity key' },
          predicate: { type: 'string', description: 'short verb phrase, e.g. "leads", "integrates with", "owns"' },
          object: { type: 'string', description: 'entity key, if the other side is an entity' },
          value: { type: 'string', description: 'otherwise a short literal: a date, number or attribute' },
        },
        required: ['memory_id', 'subject', 'predicate'],
      },
    },
  },
  required: ['links'],
};

const ENTITY_PROMPT = `You list the entities in a person's work memories. Each memory is one sentence
about their work. "The user" is the person themself.

Entities are the specific people, teams, companies, vendors, banks, projects, products,
systems, processes and metrics the memories are about — not just named people and companies.
The work itself is entities too: a launch or release ("Merchant onboarding V2"), an API or
service ("Onboarding API"), a feature ("UPI autopay"), a migration ("Ledger migration"), an
incident, a compliance step ("PAN verification"), a document, a recurring ritual ("Standup
updates"), a metric ("KYC drop-off rate"). Be thorough: anything named or referred to
specifically in two or more memories, or central to one, is an entity. Expect 30 to 60.

Resolve names: the same real thing under different spellings or partial names is ONE entity
("Rahul" and "Rahul Iyer"). Use the fullest name as "name"; put the others in "aliases".
Do NOT merge things that are merely related — a vendor and the check it performs, or a
project and its metric, are two entities.

Never make "the user" an entity, nor generic nouns ("the team", "a meeting", "the release").
Summaries come only from the memories; invent nothing.`;

const LINK_PROMPT = `You connect a person's work memories to a fixed list of entities. "The user" is the
person themself and is never an entity.

For EVERY memory, emit at least one link capturing its main claim, using entity keys from the
list exactly. Whenever a memory concerns two entities, the link connects them, the second as
"object". Emit several links when a memory relates several entities. Use "value" only when the
other side is a literal (a date, amount, status). A memory about the user's own decision is
phrased around what it concerns ("upi_autopay" — "dropped from" — "merchant_onboarding_v2").
Predicates are short, lower-case verb phrases. Use only keys from the list.`;

type Raw = {
  entities: { key: string; name: string; type: string; aliases: string[]; summary: string }[];
  links: { memory_id: string; subject: string; predicate: string; object?: string; value?: string }[];
};

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

// One call per rebuild, so it can afford a stronger model than per-dictation extraction:
// the lite model resolved names well but listed only a handful of entities.
const GRAPH_MODEL = () => process.env.KIVI_GRAPH_MODEL || 'gemini-3.5-flash';

/** Rebuilds the graph for one user from their facts and preferences, active and superseded. */
export async function buildGraph(userId = config.defaultUserId) {
  migrate();
  const d = db();
  const memories = d
    .prepare(
      `SELECT id, kind, statement, subject, status FROM memories
       WHERE user_id = ? AND kind IN ('fact','preference') AND status IN ('active','superseded')
       ORDER BY first_seen_at`
    )
    .all(userId) as { id: string; kind: string; statement: string; subject: string | null; status: string }[];
  if (memories.length === 0) throw new Error('no memories to build a graph from — seed the database first');

  const line = (m: (typeof memories)[number]) =>
    `${m.id} [${m.kind}${m.status === 'superseded' ? ', superseded' : ''}] ${m.statement}`;

  // Pass 1: entities and their resolution, from everything at once — resolution needs to
  // see every spelling.
  const ents = await generateJson<Pick<Raw, 'entities'>>({
    system: ENTITY_PROMPT,
    contents: [{ role: 'user', parts: [{ text: `Memories:\n${memories.map(line).join('\n')}` }] }],
    jsonSchema: ENTITY_SCHEMA,
    temperature: 0,
    purpose: 'graph',
    provider: 'gemini',
    model: GRAPH_MODEL(),
    thinkingLevel: 'medium',
  });
  const entityList = (ents.value.entities ?? [])
    .map((e) => `${e.key}: ${e.name}${e.aliases?.length ? ` (also: ${e.aliases.join(', ')})` : ''}`)
    .join('\n');

  // Pass 2: links against that fixed list, in parallel batches so no single answer is long.
  const BATCH = 45;
  const batches: (typeof memories)[] = [];
  for (let i = 0; i < memories.length; i += BATCH) batches.push(memories.slice(i, i + BATCH));
  const linked = await Promise.all(
    batches.map((b) =>
      generateJson<Pick<Raw, 'links'>>({
        system: LINK_PROMPT,
        contents: [
          { role: 'user', parts: [{ text: `Entities:\n${entityList}\n\nMemories:\n${b.map(line).join('\n')}` }] },
        ],
        jsonSchema: LINK_SCHEMA,
        temperature: 0,
        purpose: 'graph',
        provider: 'gemini',
        model: GRAPH_MODEL(),
        thinkingLevel: 'low',
      })
    )
  );
  const value: Raw = { entities: ents.value.entities ?? [], links: linked.flatMap((l) => l.value.links ?? []) };
  const usage = {
    model: GRAPH_MODEL(),
    costUsd: ents.usage.costUsd + linked.reduce((a, l) => a + l.usage.costUsd, 0),
  };

  if (process.env.KIVI_GRAPH_DEBUG) {
    (await import('node:fs')).writeFileSync(process.env.KIVI_GRAPH_DEBUG, JSON.stringify(value, null, 1));
  }

  // Validate everything the model returned against what exists.
  const known = new Set(memories.map((m) => m.id));
  const byKey = new Map<string, Raw['entities'][number]>();
  // Deterministic second pass over entity resolution: two keys whose names or aliases
  // normalise to the same string are the same entity, whatever the model decided.
  const nameToKey = new Map<string, string>();
  const canonical = new Map<string, string>();
  for (const e of value.entities ?? []) {
    if (!e?.key || !e?.name) continue;
    const type = (ENTITY_TYPES as readonly string[]).includes(e.type) ? e.type : 'other';
    const names = [e.name, ...(e.aliases ?? [])].map(norm).filter(Boolean);
    const existing = names.map((n) => nameToKey.get(n)).find(Boolean);
    if (existing) {
      const into = byKey.get(existing)!;
      into.aliases = [...new Set([...into.aliases, e.name, ...(e.aliases ?? [])])].filter((a) => a !== into.name);
      canonical.set(e.key, existing);
      continue;
    }
    byKey.set(e.key, { ...e, type, aliases: [...new Set((e.aliases ?? []).filter((a) => a && a !== e.name))] });
    canonical.set(e.key, e.key);
    for (const n of names) nameToKey.set(n, e.key);
  }
  const resolve = (k?: string) => (k ? canonical.get(k) ?? nameToKey.get(norm(k)) : undefined);

  const links = (value.links ?? [])
    .filter((l) => l && known.has(l.memory_id) && resolve(l.subject) && l.predicate)
    .map((l) => ({
      memory_id: l.memory_id,
      subject: resolve(l.subject)!,
      predicate: l.predicate.trim().toLowerCase().slice(0, 60),
      object: resolve(l.object),
      value: l.object && !resolve(l.object) ? l.object : l.value?.slice(0, 120) ?? null,
    }))
    .filter((l) => l.object !== l.subject);

  const used = new Set(links.flatMap((l) => [l.subject, l.object].filter(Boolean) as string[]));
  const ids = new Map<string, string>();
  for (const k of used) ids.set(k, `e_${k.replace(/[^a-z0-9_]/gi, '').toLowerCase().slice(0, 40)}`);

  d.transaction(() => {
    d.prepare('DELETE FROM graph_links WHERE user_id = ?').run(userId);
    d.prepare('DELETE FROM graph_entities WHERE user_id = ?').run(userId);
    const insE = d.prepare(
      'INSERT OR REPLACE INTO graph_entities (id, user_id, name, type, aliases_json, summary) VALUES (?,?,?,?,?,?)'
    );
    for (const k of used) {
      const e = byKey.get(k)!;
      insE.run(ids.get(k), userId, e.name, e.type, JSON.stringify(e.aliases), e.summary ?? null);
    }
    const insL = d.prepare(
      'INSERT INTO graph_links (user_id, memory_id, subject_id, predicate, object_id, object_value) VALUES (?,?,?,?,?,?)'
    );
    for (const l of links) {
      insL.run(userId, l.memory_id, ids.get(l.subject), l.predicate, l.object ? ids.get(l.object) : null, l.value);
    }
    d.prepare(
      'INSERT INTO graph_builds (user_id, model, memories, entities, links, cost_usd) VALUES (?,?,?,?,?,?)'
    ).run(userId, usage.model, memories.length, used.size, links.length, usage.costUsd);
  })();

  const covered = new Set(links.map((l) => l.memory_id)).size;
  return { memories: memories.length, covered, entities: used.size, links: links.length, costUsd: usage.costUsd };
}

export type GraphNode = { id: string; name: string; type: string; aliases: string[]; summary: string | null; degree: number };
export type GraphLink = {
  id: number;
  source: string;
  target: string | null;
  predicate: string;
  value: string | null;
  memory_id: string;
  statement: string;
  status: 'active' | 'superseded';
  kind: string;
};

/** The live graph: links inherit their memory's current status; forgotten ones vanish. */
export function loadGraph(userId = config.defaultUserId): { nodes: GraphNode[]; links: GraphLink[]; built: any } {
  migrate();
  const d = db();
  const links = d
    .prepare(
      `SELECT l.id, l.subject_id source, l.object_id target, l.predicate, l.object_value value,
              l.memory_id, m.statement, m.status, m.kind
       FROM graph_links l JOIN memories m ON m.id = l.memory_id
       WHERE l.user_id = ? AND m.status IN ('active','superseded')`
    )
    .all(userId) as GraphLink[];
  const degree = new Map<string, number>();
  for (const l of links) {
    degree.set(l.source, (degree.get(l.source) ?? 0) + 1);
    if (l.target) degree.set(l.target, (degree.get(l.target) ?? 0) + 1);
  }
  const nodes = (
    d.prepare('SELECT id, name, type, aliases_json, summary FROM graph_entities WHERE user_id = ?').all(userId) as any[]
  )
    .filter((n) => degree.has(n.id))
    .map((n) => ({
      id: n.id,
      name: n.name,
      type: n.type,
      aliases: JSON.parse(n.aliases_json || '[]'),
      summary: n.summary,
      degree: degree.get(n.id) ?? 0,
    }));
  const built = d.prepare('SELECT * FROM graph_builds WHERE user_id = ? ORDER BY id DESC LIMIT 1').get(userId) ?? null;
  return { nodes, links, built };
}

/**
 * Hey Kivi's view of one entity: who or what it is, every relation it takes part in, and
 * the memories behind them. Names resolve through aliases, so "Rahul" finds Rahul Iyer.
 */
export function aboutEntity(userId: string, name: string, includeHistory = false) {
  const g = loadGraph(userId);
  const q = norm(name);
  if (!q) return null;
  const score = (n: GraphNode) => {
    const names = [n.name, ...n.aliases].map(norm);
    if (names.includes(q)) return 3;
    if (names.some((x) => x.split(' ').includes(q) || q.split(' ').includes(x))) return 2;
    if (names.some((x) => x.includes(q) || q.includes(x))) return 1;
    return 0;
  };
  const ranked = g.nodes
    .map((n) => ({ n, s: score(n) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s || b.n.degree - a.n.degree);
  if (!ranked.length) return { found: false as const, candidates: [] as string[] };
  const top = ranked[0].n;
  const byId = new Map(g.nodes.map((n) => [n.id, n]));
  const mine = g.links.filter(
    (l) => (l.source === top.id || l.target === top.id) && (includeHistory || l.status === 'active')
  );
  return {
    found: true as const,
    entity: { id: top.id, name: top.name, type: top.type, aliases: top.aliases, summary: top.summary },
    other_matches: ranked.slice(1, 4).map((x) => x.n.name),
    relations: mine.map((l) => ({
      subject: byId.get(l.source)?.name,
      predicate: l.predicate,
      object: l.target ? byId.get(l.target)?.name : l.value,
      memory_id: l.memory_id,
      memory: l.statement,
      status: l.status === 'active' ? undefined : l.status,
    })),
    connected_to: [
      ...new Set(mine.flatMap((l) => [l.source, l.target]).filter((x) => x && x !== top.id) as string[]),
    ]
      .map((id) => byId.get(id)?.name)
      .filter(Boolean),
  };
}
