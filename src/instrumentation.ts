/**
 * Runs once when the server starts. In the public demo this restores the seeded database
 * and schedules the daily restore (src/lib/demo.ts); locally it does nothing.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  if (!process.env.KIVI_DEMO_SEED) return;
  const { startDemoClock } = await import('./lib/demo');
  startDemoClock();
}
