import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { getSessionUser } from '@/lib/auth/session';
import { DealError } from './deals';

/** The signed-in user's id (the email's local part, e.g. "maya"), from the session cookie. */
export async function requireUserId(req: Request): Promise<string> {
  const user = await getSessionUser(req);
  if (!user) throw new DealError('sign in first', 401);
  return user.id;
}

/**
 * Errors are matched by name, not instanceof: Next can load this code in more than one module
 * graph (route bundle vs the shared runtime), and then instanceof is false for a real DealError.
 */
function named(err: unknown, name: string): err is Error {
  return err instanceof Error && err.name === name;
}

export function errorResponse(err: unknown) {
  if (named(err, 'DealError')) {
    return NextResponse.json({ error: err.message }, { status: (err as Error & { status: number }).status });
  }
  if (named(err, 'InvalidTransitionError')) return NextResponse.json({ error: err.message }, { status: 409 });
  if (named(err, 'ZodError') || err instanceof ZodError) {
    return NextResponse.json({ error: 'invalid request', issues: (err as ZodError).issues }, { status: 400 });
  }
  if (named(err, 'PayPalError')) {
    const e = err as Error & { status: number; details?: unknown };
    console.error('PayPal error', e.status, JSON.stringify(e.details));
    return NextResponse.json({ error: 'payment provider error' }, { status: 502 });
  }
  console.error(err);
  return NextResponse.json({ error: 'internal error' }, { status: 500 });
}
