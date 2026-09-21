import { NextRequest, NextResponse } from 'next/server';
import { config } from '@/lib/config';
import { db, migrate } from '@/lib/db';
import { searchDictations } from '@/lib/retrieve';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  migrate();
  const url = new URL(req.url);
  const userId = url.searchParams.get('userId') || config.defaultUserId;
  const q = (url.searchParams.get('q') || '').trim();
  const app = url.searchParams.get('app');
  const limit = Number(url.searchParams.get('limit') || 60);

  if (q || app) {
    /*
     * The person's own history page includes their personal dictations.
     *
     * Excluding them is right in the Hey Kivi retrieval path, so an unrelated question
     * never surfaces a message about someone's health. It is wrong here: this page is
     * the raw record, the person is looking at their own words on purpose, and browsing
     * already showed those rows — so typing a search term made them silently disappear
     * from a list they were just reading. Not learning from something and refusing to
     * help someone find it are different decisions.
     *
     * Credentials stay excluded either way; searchDictations never returns 'secret'.
     */
    const found = await searchDictations({ userId, query: q, app, limit, includePersonal: true });
    return NextResponse.json({ dictations: found });
  }
  const rows = db()
    .prepare('SELECT * FROM dictations WHERE user_id = ? ORDER BY spoken_at DESC LIMIT ?')
    .all(userId, limit);
  return NextResponse.json({ dictations: rows });
}
