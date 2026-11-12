/**
 * Builds db/seed.db, the pristine database the public demo restores from every day.
 *
 *   npm run demo:seed
 *
 * Works in a separate file (db/build.db) so your local db/kivi.db is untouched: fresh schema,
 * the full corpus ingested, the entity graph, a handful of answered questions for the "Why"
 * page — then compacted into one self-contained file with no WAL beside it.
 */
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';

const build = path.resolve('db', 'build.db');
const seed = path.resolve('db', 'seed.db');
const env = { ...process.env, KIVI_DB_PATH: build };
const run = (cmd: string) => {
  console.log(`\n$ ${cmd}`);
  execSync(cmd, { stdio: 'inherit', env });
};

const t0 = Date.now();
run('npx tsx scripts/reset.ts');
run('npx tsx scripts/ingest.ts corpus/dictations.jsonl');
run('npx tsx scripts/graph.ts');
run('npx tsx scripts/warm.ts');

const d = new Database(build);
d.pragma('wal_checkpoint(TRUNCATE)');
for (const f of [seed, `${seed}-wal`, `${seed}-shm`]) fs.rmSync(f, { force: true });
d.exec(`VACUUM INTO '${seed.replace(/\\/g, '/')}'`);
d.close();
const mb = (fs.statSync(seed).size / 1e6).toFixed(1);
console.log(`\nseed written: ${seed} (${mb} MB) in ${((Date.now() - t0) / 60000).toFixed(1)} min`);
