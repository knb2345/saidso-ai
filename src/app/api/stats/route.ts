import fs from 'node:fs';
import path from 'node:path';
import { NextResponse } from 'next/server';
import { config } from '@/lib/config';
import { db, dbSizeBytes, migrate } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  migrate();
  const d = db();
  const userId = config.defaultUserId;
  const count = (sql: string, ...p: any[]) => (d.prepare(sql).get(...p) as any)?.c ?? 0;

  return NextResponse.json({
    user: userId,
    dictations: count('SELECT COUNT(*) c FROM dictations WHERE user_id = ?', userId),
    personalDictations: count(`SELECT COUNT(*) c FROM dictations WHERE user_id = ? AND sensitivity = 'personal'`, userId),
    memories: {
      active: count(`SELECT COUNT(*) c FROM memories WHERE user_id = ? AND status='active'`, userId),
      fact: count(`SELECT COUNT(*) c FROM memories WHERE user_id=? AND status='active' AND kind='fact'`, userId),
      preference: count(`SELECT COUNT(*) c FROM memories WHERE user_id=? AND status='active' AND kind='preference'`, userId),
      episode: count(`SELECT COUNT(*) c FROM memories WHERE user_id=? AND status='active' AND kind='episode'`, userId),
      superseded: count(`SELECT COUNT(*) c FROM memories WHERE user_id=? AND status='superseded'`, userId),
      forgotten: count(`SELECT COUNT(*) c FROM memories WHERE user_id=? AND status='forgotten'`, userId),
    },
    decisions: d.prepare('SELECT decision, COUNT(*) c FROM extraction_decisions GROUP BY decision').all(),
    model: d
      .prepare(
        `SELECT purpose, COUNT(*) calls, SUM(input_tokens) input_tokens, SUM(output_tokens) output_tokens,
                ROUND(SUM(cost_usd), 4) cost_usd, ROUND(AVG(latency_ms)) avg_latency_ms
         FROM model_calls GROUP BY purpose`
      )
      .all(),
    dbBytes: dbSizeBytes(),
    lastIngest: d.prepare('SELECT * FROM ingest_runs ORDER BY started_at DESC LIMIT 1').get() ?? null,
    evaluation: evalSummary(),
  });
}

/** The headline numbers of the shipped evaluation run, so no page has to hard-code them. */
function evalSummary() {
  try {
    const dir = path.join(process.cwd(), 'eval', 'results');
    const r = JSON.parse(fs.readFileSync(path.join(dir, 'results.json'), 'utf8'));
    let runs: number[] = [r.summary.cases.passed];
    try {
      runs = JSON.parse(fs.readFileSync(path.join(dir, 'variance.json'), 'utf8')).runs.map((x: any) => x.passed);
    } catch {
      /* a single run is all there is */
    }
    return {
      runs,
      passed: r.summary.cases.passed,
      total: r.summary.cases.total,
      memoryPassed: r.summary.memory_state.passed,
      memoryTotal: r.summary.memory_state.total,
      costPerQuestion: r.summary.cost_usd.per_question,
      p50Ms: r.summary.latency_ms.end_to_end_p50,
    };
  } catch {
    return null;
  }
}
