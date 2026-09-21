/** Move dates by whole UTC days so a 5pm dictation remains a 5pm dictation. */
export function demoDateShift(newest: string, now = new Date()): number {
  const sourceDay = Date.parse(newest.slice(0, 10) + 'T00:00:00.000Z');
  const today = Date.parse(now.toISOString().slice(0, 10) + 'T00:00:00.000Z');
  return today - 86_400_000 - sourceDay;
}

/** The corpus's last day is yesterday for reproducible relative-time questions. */
export function evaluationTime(newest: string): Date {
  return new Date(Date.parse(newest.slice(0, 10) + 'T12:00:00.000Z') + 86_400_000);
}

export function citationIds(text: string): string[] {
  return [...new Set(text.match(/\b[md]_[a-z0-9]+\b/g) ?? [])];
}

/**
 * Remove row ids from text a person reads.
 *
 * The model is asked to cite what it used, and it writes the ids into the sentence as
 * well as the structured field. Harvesting them from the prose is deliberate — a model
 * that names its sources mid-sentence and leaves the field empty is still citing — but
 * "d_00203" means nothing to the person whose history this is, and the interface already
 * shows every source as a chip with its date and app. So the ids are read first and
 * stripped second: kept as provenance, removed from the reading.
 *
 * A parenthesis is only deleted when it holds nothing but ids; "(confirmed by email)"
 * survives.
 */
export function stripCitationIds(text: string): string {
  if (!text) return text;
  return text
    .replace(/\s*\((?:[^()]*?)?\b[md]_[a-z0-9]+\b(?:[^()]*?)?\)/gi, (m) =>
      /[a-z]{4,}/i.test(m.replace(/\b[md]_[a-z0-9]+\b/gi, '')) ? m : ''
    )
    .replace(/\s*\b[md]_[a-z0-9]+\b/gi, '')
    .replace(/\s+([,.;:!?])/g, '$1')
    .replace(/\(\s*[,;]?\s*\)/g, '')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}
