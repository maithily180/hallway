import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { errorResponse } from '@/lib/engine/http';
import { getDealService } from '@/lib/engine/runtime';

function authorized(req: Request, secret: string): boolean {
  const given = Buffer.from(req.headers.get('authorization') ?? '');
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/**
 * Scheduled job (see render.yaml): refreshes rental holds that have reached day 3, so a long
 * rental can still be captured on return. Needs `Authorization: Bearer $CRON_SECRET`; with no
 * CRON_SECRET configured the job is switched off.
 */
export async function POST(req: Request) {
  try {
    const secret = process.env.CRON_SECRET;
    if (!secret) return NextResponse.json({ error: 'job is not configured' }, { status: 503 });
    if (!authorized(req, secret)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    return NextResponse.json(await (await getDealService()).reauthorizeDue());
  } catch (err) {
    return errorResponse(err);
  }
}
