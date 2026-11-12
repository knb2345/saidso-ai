import { NextRequest, NextResponse } from 'next/server';
import { askHeyKivi, ensureConversation, saveTurn } from '@/lib/agent';
import { config } from '@/lib/config';
import { ensureUser, migrate } from '@/lib/db';
import { clip, spendGuard } from '@/lib/guard';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  migrate();
  const body = await req.json();
  const userId = body.userId || config.defaultUserId;
  ensureUser(userId);
  const question = clip(body.question, 800);
  if (!question) return NextResponse.json({ error: 'question is required' }, { status: 400 });
  const limited = spendGuard(req);
  if (limited) return limited;
  // The browser sends recent turns for context; keep them few and short.
  const history = (Array.isArray(body.history) ? body.history : [])
    .slice(-6)
    .map((h: any) => ({ role: h?.role === 'kivi' ? 'kivi' : 'user', text: clip(h?.text, 1500) })) as { role: 'user' | 'kivi'; text: string }[];

  const conversationId = ensureConversation(userId, body.conversationId);
  saveTurn(conversationId, 'user', question);

  try {
    const result = await askHeyKivi(userId, question, history);
    const turnId = saveTurn(conversationId, 'kivi', result.answer, result);
    return NextResponse.json({ ...result, conversationId, turnId });
  } catch (e: any) {
    const message = String(e?.message ?? e) || 'the model could not be reached';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
