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
 * Scheduled job (see render.yaml): refreshes rental holds that have reached day 3 (so a long
 * rental can still be captured on return) and finishes sale payouts that failed after the capture.
 * Safe to run as often as you like. Needs `Authorization: Bearer $CRON_SECRET`; with no
 * CRON_SECRET configured the job is switched off.
 */
export async function POST(req: Request) {
  try {
    const secret = process.env.CRON_SECRET;
    if (!secret) return NextResponse.json({ error: 'job is not configured' }, { status: 503 });
    if (!authorized(req, secret)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    const deals = await getDealService();
    // Keep holds alive on long rentals, and finish any payout that failed after a capture.
    return NextResponse.json({ reauthorize: await deals.reauthorizeDue(), payouts: await deals.retryPendingPayouts() });
  } catch (err) {
    return errorResponse(err);
  }
}
