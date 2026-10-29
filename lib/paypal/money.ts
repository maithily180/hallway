import type { Cents } from '@/lib/contracts';

/** The only place cents become PayPal's decimal strings. */
export function toPayPalAmount(cents: Cents): string {
  if (!Number.isInteger(cents) || cents < 0) throw new Error(`Invalid cents: ${cents}`);
  return (cents / 100).toFixed(2);
}

export function fromPayPalAmount(value: string): Cents {
  return Math.round(Number.parseFloat(value) * 100);
}

/** PayPal-Request-Id: the same deal step always sends the same id, so retries never double-act. */
export function requestId(dealId: string, step: string): string {
  return `${dealId}:${step}`;
}
