import { NextRequest, NextResponse } from 'next/server';
import { config } from '@/lib/config';
import { loadGraph } from '@/lib/graph';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const userId = new URL(req.url).searchParams.get('userId') || config.defaultUserId;
  return NextResponse.json(loadGraph(userId));
}
