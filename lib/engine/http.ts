import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { PayPalError } from '@/lib/paypal';
import { DealError } from './deals';
import { InvalidTransitionError } from './transition';

/** Current user for API routes (stand-in until login lands; see NOTES/requests.md). */
export function currentUserId(req: Request): string | undefined {
  return req.headers.get('x-user-id') ?? undefined;
}

export function errorResponse(err: unknown) {
  if (err instanceof DealError) return NextResponse.json({ error: err.message }, { status: err.status });
  if (err instanceof InvalidTransitionError) return NextResponse.json({ error: err.message }, { status: 409 });
  if (err instanceof ZodError) {
    return NextResponse.json({ error: 'invalid request', issues: err.issues }, { status: 400 });
  }
  if (err instanceof PayPalError) {
    console.error('PayPal error', err.status, JSON.stringify(err.details));
    return NextResponse.json({ error: 'payment provider error' }, { status: 502 });
  }
  console.error(err);
  return NextResponse.json({ error: 'internal error' }, { status: 500 });
}
