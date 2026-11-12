import { createHmac, timingSafeEqual } from 'node:crypto';

function secret(): string {
  const s = process.env.HANDOVER_SECRET;
  if (s) return s;
  if (process.env.NODE_ENV === 'production') throw new Error('HANDOVER_SECRET not set');
  return 'dev-only-handover-secret';
}

/** Signed token the renter shows as a QR; the owner scanning it confirms the handover. */
export function signHandoverToken(dealId: string): string {
  return createHmac('sha256', secret()).update(`handover:${dealId}`).digest('hex');
}

export function verifyHandoverToken(dealId: string, token: string): boolean {
  const expected = Buffer.from(signHandoverToken(dealId));
  const given = Buffer.from(token);
  return expected.length === given.length && timingSafeEqual(expected, given);
}
