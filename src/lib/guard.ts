import { NextRequest, NextResponse } from 'next/server';
import { config } from './config';

/**
 * Spend protection for the public demo: a per-visitor sliding window and a global daily cap
 * on requests that reach the model. In-memory on purpose — the demo runs as a single
 * replica (SQLite has one writer), so there is nothing to share state with.
 */

const WINDOW_MS = 10 * 60 * 1000;
const hits = new Map<string, number[]>();
let day = '';
let today = 0;

function visitor(req: NextRequest): string {
  const fwd = req.headers.get('x-forwarded-for');
  return (fwd ? fwd.split(',')[0] : req.headers.get('x-real-ip') || 'local').trim();
}

/** Returns a 429 response when this request should not reach the model, else null. */
export function spendGuard(req: NextRequest): NextResponse | null {
  const now = Date.now();
  const d = new Date(now).toISOString().slice(0, 10);
  if (d !== day) {
    day = d;
    today = 0;
  }
  if (config.dailyCap > 0 && today >= config.dailyCap) {
    return NextResponse.json(
      {
        error:
          'This shared demo has used its model budget for today. Everything Kivi already knows is still here to read on the other pages, and questions open again after midnight UTC.',
        limited: true,
      },
      { status: 429 }
    );
  }
  if (config.perVisitorLimit > 0) {
    const id = visitor(req);
    const recent = (hits.get(id) ?? []).filter((t) => now - t < WINDOW_MS);
    if (recent.length >= config.perVisitorLimit) {
      const wait = Math.ceil((WINDOW_MS - (now - recent[0])) / 60000);
      hits.set(id, recent);
      return NextResponse.json(
        {
          error: `You are asking faster than this shared demo allows. Try again in about ${wait} minute${wait === 1 ? '' : 's'}.`,
          limited: true,
        },
        { status: 429 }
      );
    }
    recent.push(now);
    hits.set(id, recent);
    // Keep the map from growing without bound on a long-lived server.
    if (hits.size > 5000) {
      for (const [k, v] of hits) if (!v.some((t) => now - t < WINDOW_MS)) hits.delete(k);
    }
  }
  today++;
  return null;
}

/** Trims free text arriving from a browser to a sane size before it reaches a prompt. */
export function clip(s: unknown, max: number): string {
  return String(s ?? '').trim().slice(0, max);
}
