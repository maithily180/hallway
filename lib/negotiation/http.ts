import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { getSessionUser } from '@/lib/auth/session';
import { NegotiationError } from './service';

/** The signed-in user's id (the email's local part, e.g. "maya"), from the session cookie. */
export async function requireUserId(req: Request): Promise<string> {
  const user = await getSessionUser(req);
  if (!user) throw new NegotiationError('sign in first', 401);
  return user.id;
}

export function errorResponse(err: unknown) {
  if (err instanceof NegotiationError) {
    return NextResponse.json({ error: err.message }, { status: err.status });
  }
  if (err instanceof ZodError) {
    return NextResponse.json({ error: 'invalid request', issues: err.issues }, { status: 400 });
  }
  console.error(err);
  return NextResponse.json({ error: 'internal error' }, { status: 500 });
}
