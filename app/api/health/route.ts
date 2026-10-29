import { NextResponse } from 'next/server';

/** Render's health check. Does not touch the database or PayPal. */
export function GET() {
  return NextResponse.json({ ok: true });
}
