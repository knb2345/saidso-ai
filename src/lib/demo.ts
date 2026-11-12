import fs from 'node:fs';
import path from 'node:path';
import { config } from './config';
import { closeDb, db, migrate } from './db';

/**
 * The public demo.
 *
 * One seeded database is shared by everyone who opens the link, and every visitor can
 * teach Kivi something, correct it or make it forget. That is the product working — but
 * the next visitor should still meet the history as it was seeded. So when KIVI_DEMO_SEED
 * points at a pristine copy, the live file is restored from it at start-up and again
 * whenever the UTC date changes.
 *
 * Restoring also slides the corpus dates so the newest dictation lands yesterday, which
 * keeps "the update I dictated around 5pm yesterday" true on every day the demo runs.
 */

const DAY = 86_400_000;
const midnight = (iso: string) => Date.parse(iso.slice(0, 10) + 'T00:00:00.000Z');

// Dictations made inside the app are stamped with the real clock and must not move, nor
// define where the corpus ends.
const CORPUS_ONLY = `metadata_json NOT LIKE '%dictated_in_app%'
                 AND metadata_json NOT LIKE '%hey_kivi_request%'
                 AND COALESCE(app,'') != 'hey kivi'`;

/** Shifts the corpus by whole UTC days so its newest record is yesterday. Returns the shift. */
export function shiftCorpusDates(now = new Date()): number {
  const d = db();
  const row = d.prepare(`SELECT MAX(spoken_at) AS newest FROM dictations WHERE ${CORPUS_ONLY}`).get() as
    | { newest: string | null }
    | undefined;
  if (!row?.newest) return 0;
  const days = Math.round((midnight(now.toISOString()) - DAY - midnight(row.newest)) / DAY);
  if (days === 0) return 0;
  const shift = (col: string) => `strftime('%Y-%m-%dT%H:%M:%f', datetime(${col}, '${days} days')) || 'Z'`;
  d.transaction(() => {
    d.prepare(`UPDATE dictations SET spoken_at = ${shift('spoken_at')} WHERE ${CORPUS_ONLY}`).run();
    d.prepare(
      `UPDATE memories SET
         first_seen_at = ${shift('first_seen_at')},
         last_seen_at  = ${shift('last_seen_at')},
         valid_from    = CASE WHEN valid_from IS NULL THEN NULL ELSE ${shift('valid_from')} END`
    ).run();
  })();
  return days;
}

let restoredFor = '';

/** Restores the pristine database (if configured) and re-dates it. Safe to call repeatedly. */
export function resetDemo(reason: string) {
  const seed = config.demoSeed;
  if (!seed) return;
  if (!fs.existsSync(seed)) {
    console.warn(`[demo] KIVI_DEMO_SEED=${seed} does not exist; serving the database as it is`);
    return;
  }
  closeDb();
  fs.mkdirSync(path.dirname(config.dbPath), { recursive: true });
  for (const suffix of ['', '-wal', '-shm']) fs.rmSync(config.dbPath + suffix, { force: true });
  fs.copyFileSync(seed, config.dbPath);
  migrate();
  const days = shiftCorpusDates();
  restoredFor = new Date().toISOString().slice(0, 10);
  console.log(`[demo] restored from seed (${reason}); corpus shifted ${days} day(s)`);
}

/** Called once per server start. Restores now, then once a day after midnight UTC. */
export function startDemoClock() {
  if (!config.demoSeed) return;
  resetDemo('start-up');
  const timer = setInterval(() => {
    const today = new Date().toISOString().slice(0, 10);
    if (today !== restoredFor) resetDemo('new day');
  }, 5 * 60 * 1000);
  timer.unref?.();
}
