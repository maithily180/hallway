import type { Cents } from '@/lib/contracts';

const DOLLAR_SIGN = /\$\s?(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{1,2}))?/g;
const DOLLAR_WORD = /\b(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{1,2}))?\s*(?:dollars?|usd|bucks)\b/gi;

function toCents(whole: string, frac?: string): Cents {
  return Number.parseInt(whole.replace(/,/g, ''), 10) * 100 + Number.parseInt((frac ?? '0').padEnd(2, '0'), 10);
}

/** Every dollar amount mentioned in the text, in cents. */
export function extractAmountsCents(text: string): Cents[] {
  const found: Cents[] = [];
  for (const re of [DOLLAR_SIGN, DOLLAR_WORD]) {
    for (const m of text.matchAll(re)) found.push(toCents(m[1], m[2]));
  }
  return found;
}

export type OutgoingCheck = { ok: true } | { ok: false; reason: 'price_leak' };

/**
 * Outgoing check: a phrased reply may only mention the engine's chosen price.
 * Any other amount, including the floor or auto-accept, blocks the message.
 */
export function checkOutgoing(text: string, allowedPriceCents: Cents): OutgoingCheck {
  const amounts = extractAmountsCents(text);
  return amounts.every((a) => a === allowedPriceCents) ? { ok: true } : { ok: false, reason: 'price_leak' };
}
