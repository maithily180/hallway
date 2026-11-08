import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { getSessionUser } from '@/lib/auth/session';
import { PayPalError } from '@/lib/paypal';
import { DealError } from './deals';
import { InvalidTransitionError } from './transition';

/** The signed-in user's id (the email's local part, e.g. "maya"), from the session cookie. */
export async function requireUserId(req: Request): Promise<string> {
  const user = await getSessionUser(req);
  if (!user) throw new DealError('sign in first', 401);
  return user.id;
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
