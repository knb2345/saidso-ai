'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

/*
 * The entity graph Kivi's memories imply: who and what they are about, resolved across
 * spellings, and how those things relate. Every edge is a memory; every memory is one
 * click from the dictation that produced it.
 */

type GNode = { id: string; name: string; type: string; aliases: string[]; summary: string | null; degree: number };
type GLink = {
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

const TYPE_COLOR: Record<string, string> = {
  person: '#8ce23f',
  team: '#5fd4b0',
  organization: '#7fc7e8',
  project: '#e0b23f',
  system: '#b59cf0',
  process: '#e8a0c8',
  metric: '#e2705f',
  other: '#8f958c',
};

const W = 900;
const H = 640;

type P = { x: number; y: number; vx: number; vy: number; fx?: number; fy?: number };

const radius = (n: GNode) => 7 + Math.sqrt(n.degree) * 3.2;

export default function GraphPage() {
  const [data, setData] = useState<{ nodes: GNode[]; links: GLink[]; built: any } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [, setFrame] = useState(0);
  const pos = useRef(new Map<string, P>());
  const alpha = useRef(1);
  const raf = useRef(0);
  const svg = useRef<SVGSVGElement>(null);
  const drag = useRef<{ id: string; moved: number; x0: number; y0: number } | null>(null);
  const [vb, setVb] = useState(`0 0 ${W} ${H}`);

  // Frame whatever the layout settled into, keeping the canvas's aspect ratio.
  const fit = useCallback(() => {
    if (!data || !data.nodes.length) return;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const n of data.nodes) {
      const p = pos.current.get(n.id);
      if (!p) continue;
      const r = radius(n) + 10;
      x0 = Math.min(x0, p.x - r - 40);
      x1 = Math.max(x1, p.x + r + 40);
      y0 = Math.min(y0, p.y - r);
      y1 = Math.max(y1, p.y + r + 20);
    }
    let w = x1 - x0, h = y1 - y0;
    const ratio = W / H;
    if (w / h < ratio) { const nw = h * ratio; x0 -= (nw - w) / 2; w = nw; }
    else { const nh = w / ratio; y0 -= (nh - h) / 2; h = nh; }
    setVb(`${x0.toFixed(1)} ${y0.toFixed(1)} ${w.toFixed(1)} ${h.toFixed(1)}`);
  }, [data]);

  useEffect(() => {
    fetch('/api/graph')
      .then((r) => r.json())
      .then((g) => (g.nodes ? setData(g) : setError(g.error ?? 'no graph')))
      .catch((e) => setError(String(e)));
  }, []);

  // Multiple memories between the same two entities draw as one thicker edge.
  const edges = useMemo(() => {
    if (!data) return [];
    const m = new Map<string, { a: string; b: string; links: GLink[] }>();
    for (const l of data.links) {
      if (!l.target) continue;
      const [a, b] = l.source < l.target ? [l.source, l.target] : [l.target, l.source];
      const k = `${a}|${b}`;
      if (!m.has(k)) m.set(k, { a, b, links: [] });
      m.get(k)!.links.push(l);
    }
    return [...m.values()];
  }, [data]);

  const nodeById = useMemo(() => new Map((data?.nodes ?? []).map((n) => [n.id, n])), [data]);

  const tick = useCallback(() => {
    if (!data) return;
    const a = alpha.current;
    const ps = data.nodes.map((n) => [n, pos.current.get(n.id)!] as const);
    // Repulsion and collision.
    for (let i = 0; i < ps.length; i++) {
      for (let j = i + 1; j < ps.length; j++) {
        const [ni, pi] = ps[i];
        const [nj, pj] = ps[j];
        let dx = pj.x - pi.x;
        let dy = pj.y - pi.y;
        let d2 = dx * dx + dy * dy;
        if (d2 < 1) {
          dx = Math.random() - 0.5;
          dy = Math.random() - 0.5;
          d2 = 1;
        }
        const d = Math.sqrt(d2);
        let f = (9000 * a) / d2;
        const min = radius(ni) + radius(nj) + 26;
        if (d < min) f += ((min - d) / d) * 0.5;
        pi.vx -= (dx / d) * f;
        pi.vy -= (dy / d) * f;
        pj.vx += (dx / d) * f;
        pj.vy += (dy / d) * f;
      }
    }
    // Springs.
    for (const e of edges) {
      const pa = pos.current.get(e.a)!;
      const pb = pos.current.get(e.b)!;
      const dx = pb.x - pa.x;
      const dy = pb.y - pa.y;
      const d = Math.sqrt(dx * dx + dy * dy) || 1;
      const k = 0.035 * a * Math.min(2.2, 1 + Math.log(e.links.length));
      const f = (d - 150) * k;
      pa.vx += (dx / d) * f;
      pa.vy += (dy / d) * f;
      pb.vx -= (dx / d) * f;
      pb.vy -= (dy / d) * f;
    }
    for (const [n, p] of ps) {
      p.vx += (W / 2 - p.x) * 0.006 * a * (n.degree ? 1 : 2.5);
      p.vy += (H / 2 - p.y) * 0.009 * a * (n.degree ? 1 : 2.5);
      if (p.fx !== undefined) {
        p.x = p.fx;
        p.y = p.fy!;
        p.vx = p.vy = 0;
        continue;
      }
      p.vx *= 0.58;
      p.vy *= 0.58;
      p.x = Math.max(40, Math.min(W - 40, p.x + p.vx));
      p.y = Math.max(30, Math.min(H - 34, p.y + p.vy));
    }
    alpha.current = Math.max(0, a * 0.985 - 0.0005);
  }, [data, edges]);

  // Initial layout: a golden-angle spiral, highest degree in the middle, settled before
  // the first paint so the graph does not explode onto the screen.
  useEffect(() => {
    if (!data) return;
    const order = [...data.nodes].sort((a, b) => b.degree - a.degree);
    order.forEach((n, i) => {
      const ang = i * 2.39996;
      const r = 30 + Math.sqrt(i) * 62;
      pos.current.set(n.id, { x: W / 2 + Math.cos(ang) * r, y: H / 2 + Math.sin(ang) * r * 0.8, vx: 0, vy: 0 });
    });
    alpha.current = 1;
    for (let i = 0; i < 260; i++) tick();
    alpha.current = 0.12;
    fit();
    setFrame((f) => f + 1);
  }, [data, tick, fit]);

  const run = useCallback(() => {
    cancelAnimationFrame(raf.current);
    const loop = () => {
      tick();
      setFrame((f) => f + 1);
      if (alpha.current > 0.004 || drag.current) raf.current = requestAnimationFrame(loop);
      else fit();
    };
    raf.current = requestAnimationFrame(loop);
  }, [tick, fit]);

  useEffect(() => {
    if (data) run();
    return () => cancelAnimationFrame(raf.current);
  }, [data, run]);

  const toSvg = (e: React.PointerEvent) => {
    const m = svg.current!.getScreenCTM()!.inverse();
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m);
    return { x: p.x, y: p.y };
  };

  const dragged = useRef(false);
  const onDown = (id: string) => (e: React.PointerEvent) => {
    e.preventDefault();
    dragged.current = false;
    // Distance is measured on screen, not in SVG units, which change when the view refits.
    drag.current = { id, moved: 0, x0: e.clientX, y0: e.clientY };
    const p = pos.current.get(id)!;
    p.fx = p.x;
    p.fy = p.y;
    alpha.current = Math.max(alpha.current, 0.25);
    run();
  };
  const onMove = (e: React.PointerEvent) => {
    if (!drag.current) return;
    const { x, y } = toSvg(e);
    const p = pos.current.get(drag.current.id)!;
    drag.current.moved = Math.max(drag.current.moved, Math.hypot(e.clientX - drag.current.x0, e.clientY - drag.current.y0));
    p.fx = x;
    p.fy = y;
    alpha.current = Math.max(alpha.current, 0.18);
  };
  const onUp = () => {
    const d = drag.current;
    if (!d) return;
    const p = pos.current.get(d.id)!;
    p.fx = p.fy = undefined;
    drag.current = null;
    // A real drag also ends in a click on the node; that click should not select it.
    dragged.current = d.moved >= 6;
    run();
  };
  const onClick = (id: string) => () => {
    if (dragged.current) {
      dragged.current = false;
      return;
    }
    setSelected((s) => (s === id ? null : id));
  };

  const focus = hover ?? selected;
  const neighbours = useMemo(() => {
    const s = new Set<string>();
    if (!focus) return s;
    s.add(focus);
    for (const e of edges) {
      if (e.a === focus) s.add(e.b);
      if (e.b === focus) s.add(e.a);
    }
    return s;
  }, [focus, edges]);

  // Edge labels are legible around a small neighbourhood; around a hub they pile up, and
  // the panel lists every relation anyway.
  const focusEdges = focus ? edges.filter((e) => e.a === focus || e.b === focus).length : 0;

  if (error) {
    return (
      <div className="page">
        <h1>Knowledge graph</h1>
        <div className="banner">{error}</div>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="page">
        <h1>Knowledge graph</h1>
        <p className="lede">loading…</p>
      </div>
    );
  }
  if (data.nodes.length === 0) {
    return (
      <div className="page">
        <h1>Knowledge graph</h1>
        <p className="lede">
          No graph has been built for this history yet. Run <code>npm run graph</code>.
        </p>
      </div>
    );
  }

  const sel = selected ? nodeById.get(selected) : null;
  const types = [...new Set(data.nodes.map((n) => n.type))];
  const covered = new Set(data.links.map((l) => l.memory_id)).size;

  return (
    <div className="page wide">
      <h1>Knowledge graph</h1>
      <p className="lede">
        The people, teams, systems and projects Kivi’s memories are about, with names resolved across
        spellings and every relation traced to the memory, and the dictation, it came from. Drag to
        rearrange; click an entity to see what connects it.
      </p>

      <div className="gwrap">
        <div className="gcanvas">
          <svg
            ref={svg}
            viewBox={vb}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerLeave={onUp}
            role="img"
            aria-label={`Entity graph with ${data.nodes.length} entities`}
          >
            {edges.map((e) => {
              const a = pos.current.get(e.a);
              const b = pos.current.get(e.b);
              if (!a || !b) return null;
              const on = focus ? e.a === focus || e.b === focus : false;
              const dim = focus && !on;
              const old = e.links.every((l) => l.status === 'superseded');
              return (
                <g key={`${e.a}|${e.b}`} opacity={dim ? 0.08 : on ? 1 : 0.42}>
                  <line
                    x1={a.x}
                    y1={a.y}
                    x2={b.x}
                    y2={b.y}
                    stroke={on ? '#c9f59a' : '#5a6158'}
                    strokeWidth={Math.min(5, 0.8 + e.links.length * 0.7)}
                    strokeDasharray={old ? '4 4' : undefined}
                  />
                  {on && focusEdges <= 7 && (
                    <text
                      x={(a.x + b.x) / 2}
                      y={(a.y + b.y) / 2 - 5}
                      textAnchor="middle"
                      className="gedge-label"
                    >
                      {e.links[0].predicate}
                      {e.links.length > 1 ? ` +${e.links.length - 1}` : ''}
                    </text>
                  )}
                </g>
              );
            })}
            {data.nodes.map((n) => {
              const p = pos.current.get(n.id);
              if (!p) return null;
              const r = radius(n);
              const dim = focus && !neighbours.has(n.id);
              const isSel = selected === n.id;
              return (
                <g
                  key={n.id}
                  transform={`translate(${p.x},${p.y})`}
                  opacity={dim ? 0.18 : 1}
                  className="gnode"
                  onPointerDown={onDown(n.id)}
                  onClick={onClick(n.id)}
                  onPointerEnter={() => setHover(n.id)}
                  onPointerLeave={() => setHover(null)}
                >
                  <circle r={r + 7} fill={TYPE_COLOR[n.type] ?? TYPE_COLOR.other} opacity={isSel ? 0.25 : 0.08} />
                  <circle
                    r={r}
                    fill="#121412"
                    stroke={TYPE_COLOR[n.type] ?? TYPE_COLOR.other}
                    strokeWidth={isSel ? 3 : 2}
                  />
                  <circle r={Math.max(2.5, r * 0.35)} fill={TYPE_COLOR[n.type] ?? TYPE_COLOR.other} />
                  <text y={r + 15} textAnchor="middle" className="gnode-label">
                    {n.name}
                  </text>
                </g>
              );
            })}
          </svg>
          <div className="glegend">
            {types.map((t) => (
              <span key={t}>
                <i style={{ background: TYPE_COLOR[t] ?? TYPE_COLOR.other }} />
                {t}
              </span>
            ))}
            <span>
              <i className="dash" /> only in superseded memories
            </span>
          </div>
        </div>

        <aside className="gpanel">
          {sel ? (
            <EntityPanel node={sel} links={data.links} nodeById={nodeById} onClose={() => setSelected(null)} onPick={setSelected} />
          ) : (
            <Overview nodes={data.nodes} links={data.links} covered={covered} built={data.built} onPick={setSelected} />
          )}
        </aside>
      </div>
    </div>
  );
}

function Overview({
  nodes,
  links,
  covered,
  built,
  onPick,
}: {
  nodes: GNode[];
  links: GLink[];
  covered: number;
  built: any;
  onPick: (id: string) => void;
}) {
  const resolved = nodes.filter((n) => n.aliases.length > 0).sort((a, b) => b.degree - a.degree);
  const hubs = [...nodes].sort((a, b) => b.degree - a.degree).slice(0, 5);
  return (
    <>
      <div className="gstats">
        <div>
          <b>{nodes.length}</b> entities
        </div>
        <div>
          <b>{links.length}</b> relations
        </div>
        <div>
          from <b>{covered}</b>
          {built?.memories ? ` of ${built.memories}` : ''} memories
        </div>
      </div>
      <h3 className="gh">Names resolved</h3>
      <p className="gnote">
        The same person or system turns up under several names across months of dictation. Each is one
        entity here.
      </p>
      <div className="gresolved">
        {resolved.map((n) => (
          <button key={n.id} className="gres" onClick={() => onPick(n.id)}>
            <span className="gres-from">{n.aliases.slice(0, 3).join(' · ')}</span>
            <span className="gres-arrow">→</span>
            <span className="gres-to">{n.name}</span>
          </button>
        ))}
      </div>
      <h3 className="gh">Most connected</h3>
      <div className="chips">
        {hubs.map((n) => (
          <button key={n.id} className="chip" onClick={() => onPick(n.id)}>
            {n.name} · {n.degree}
          </button>
        ))}
      </div>
      {built && (
        <p className="gnote" style={{ marginTop: 18 }}>
          Built from memory by {built.model} in two passes, first entities and resolution, then relations
          against that fixed list, for ${Number(built.cost_usd ?? 0).toFixed(3)}. Derived and
          rebuildable; a relation is only as true as its memory, and inherits its status.
        </p>
      )}
    </>
  );
}

function EntityPanel({
  node,
  links,
  nodeById,
  onClose,
  onPick,
}: {
  node: GNode;
  links: GLink[];
  nodeById: Map<string, GNode>;
  onClose: () => void;
  onPick: (id: string) => void;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const mine = links
    .filter((l) => l.source === node.id || l.target === node.id)
    .sort((a, b) => Number(a.status === 'superseded') - Number(b.status === 'superseded'));
  return (
    <>
      <div className="gpanel-top">
        <span className="kindtag" style={{ color: TYPE_COLOR[node.type] }}>
          {node.type}
        </span>
        <button className="linkish" onClick={onClose}>
          ← all entities
        </button>
      </div>
      <h2 className="gname">{node.name}</h2>
      {node.aliases.length > 0 && <div className="esrc">also called {node.aliases.join(', ')}</div>}
      {node.summary && <p className="gsummary">{node.summary}</p>}
      <Link className="linkish" href={`/ask?q=${encodeURIComponent(`What do you know about ${node.name}?`)}`}>
        ask Hey Kivi about {node.name} →
      </Link>
      <h3 className="gh">{mine.length} relations</h3>
      <div className="grels">
        {mine.map((l) => {
          const s = nodeById.get(l.source);
          const t = l.target ? nodeById.get(l.target) : null;
          return (
            <div key={l.id} className={`grel${l.status === 'superseded' ? ' old' : ''}`}>
              <div className="grel-triple">
                <Ent n={s} self={node.id} onPick={onPick} /> <span className="gpred">{l.predicate}</span>{' '}
                {t ? <Ent n={t} self={node.id} onPick={onPick} /> : <span className="gval">{l.value}</span>}
                {l.status === 'superseded' && <span className="gold">superseded</span>}
              </div>
              <button className="grel-mem" onClick={() => setOpen(open === l.memory_id ? null : l.memory_id)}>
                {l.statement}
              </button>
              {open === l.memory_id && <Evidence id={l.memory_id} />}
            </div>
          );
        })}
      </div>
    </>
  );
}

function Ent({ n, self, onPick }: { n?: GNode; self: string; onPick: (id: string) => void }) {
  if (!n) return <span>?</span>;
  if (n.id === self) return <b>{n.name}</b>;
  return (
    <button className="gent" onClick={() => onPick(n.id)}>
      {n.name}
    </button>
  );
}

function Evidence({ id }: { id: string }) {
  const [d, setD] = useState<any>(null);
  useEffect(() => {
    fetch(`/api/memories/${id}`)
      .then((r) => r.json())
      .then(setD)
      .catch(() => setD({ error: true }));
  }, [id]);
  if (!d) return <div className="esrc">loading the source…</div>;
  if (d.error || !d.evidence) return <div className="esrc">source unavailable</div>;
  if (d.evidence.length === 0) return <div className="esrc">You told Kivi this directly.</div>;
  return (
    <div>
      {d.evidence.slice(0, 2).map((e: any) => (
        <div key={e.dictation_id}>
          <div className="equote">
            <em>“{e.quote}”</em>
          </div>
          <div className="esrc">
            {new Date(e.spoken_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} · {e.app} ·{' '}
            {e.dictation_id}
          </div>
        </div>
      ))}
    </div>
  );
}
