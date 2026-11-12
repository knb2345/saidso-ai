/**
 * Asks Hey Saidso the intro page's starter questions once and stores the turns, exactly as the
 * API does, so the "Why" page has real traces to show the first visitor.
 *
 *   npx tsx scripts/warm.ts
 */
import { askHeyKivi, ensureConversation, saveTurn } from '../src/lib/agent';
import { config } from '../src/lib/config';
import { ensureUser, migrate } from '../src/lib/db';

const QUESTIONS = [
  'When does V2 launch?',
  'Did the launch date ever change? What was it before?',
  'Find the Slack update I dictated around 5pm yesterday and polish it into a standup update.',
  'What happened with the Truvia KYC timeouts?',
  'Who owns the HDFC integration work?',
  'What is our new pricing for enterprise merchants?',
];

migrate();
const userId = config.defaultUserId;
ensureUser(userId);
for (const q of QUESTIONS) {
  const conversation = ensureConversation(userId);
  saveTurn(conversation, 'user', q);
  const t0 = Date.now();
  try {
    const r = await askHeyKivi(userId, q);
    saveTurn(conversation, 'kivi', r.answer, r);
    console.log(`${r.outcome.padEnd(9)} ${((Date.now() - t0) / 1000).toFixed(1)}s  ${q}`);
  } catch (e: any) {
    console.warn(`failed     ${q}: ${String(e?.message ?? e).slice(0, 120)}`);
  }
}
