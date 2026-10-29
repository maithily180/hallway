import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { NegotiationError } from './service';

/**
 * Current user for API routes. Real login is Chandrani's (auth); until it lands we read
 * the `x-user-id` header so routes can be exercised. See NOTES/requests.md.
 */
export function currentUserId(req: Request): string | undefined {
  return req.headers.get('x-user-id') ?? undefined;
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
