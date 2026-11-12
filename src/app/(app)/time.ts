/**
 * Every time on screen is shown in UTC, because that is how Hey Saidso reads and speaks them
 * ("the update you dictated at 5:48 PM"). Rendering in the viewer's zone put "11:18 PM"
 * beside an answer that said 5:48 PM. A fixed locale and zone also keep server and client
 * renders identical.
 */
const STAMP = new Intl.DateTimeFormat('en-US', {
  timeZone: 'UTC',
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
});
const DAY = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric' });

/** "Nov 11, 5:48 PM UTC" */
export function stamp(iso: string | null | undefined, utcLabel = true): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return STAMP.format(d) + (utcLabel ? ' UTC' : '');
}

/** "Nov 11" */
export function day(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? String(iso) : DAY.format(d);
}
