'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

export default function Rail() {
  const path = usePathname();
  const [stats, setStats] = useState<any>(null);

  useEffect(() => {
    fetch('/api/stats').then((r) => r.json()).then(setStats).catch(() => {});
  }, [path]);

  const items = [
    { href: '/ask', label: 'Hey Saidso', count: null as string | null },
    { href: '/dictate', label: 'Dictation', count: null },
    { href: '/memory', label: 'What Saidso knows', count: stats ? String(stats.memories.active) : null },
    { href: '/graph', label: 'Knowledge graph', count: null },
    { href: '/history', label: 'Dictation history', count: stats ? String(stats.dictations) : null },
    { href: '/inspect', label: 'Why', count: null },
    { href: '/eval', label: 'Evaluation', count: null },
  ];

  return (
    <aside className="rail">
      <Link href="/" className="brand" title="What is Saidso?">
        <div className="brand-mark">
          saids<span>o</span>
        </div>
        <div className="brand-sub">about</div>
      </Link>

      <nav className="nav">
        {items.map((i) => (
          <Link key={i.href} href={i.href} className={path === i.href ? 'active' : ''}>
            <span>{i.label}</span>
            {i.count && <span className="count">{i.count}</span>}
          </Link>
        ))}
      </nav>

      <div className="rail-foot">
        <b>Demo:</b> the memory of Ananya Rao, a made-up product manager. Everything here comes
        from the 499 work messages she sent by voice. It resets every day.
      </div>
    </aside>
  );
}
