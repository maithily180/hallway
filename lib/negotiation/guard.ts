import type { Cents } from '@/lib/contracts';

const DOLLAR_SIGN = /\$\s?(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{1,2}))?/g;
const DOLLAR_WORD = /\b(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{1,2}))?\s*(?:dollars?|usd|bucks)\b/gi;

function toCents(whole: string, frac?: string): Cents {
  return Number.parseInt(whole.replace(/,/g, ''), 10) * 100 + Number.parseInt((frac ?? '0').padEnd(2, '0'), 10);
}

const UNITS: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9,
  ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16,
  seventeen: 17, eighteen: 18, nineteen: 19,
};
const TENS: Record<string, number> = {
  twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90,
};
const NUMBER_WORD = [...Object.keys(UNITS), ...Object.keys(TENS), 'hundred', 'thousand'].join('|');
// e.g. "twenty-seven dollars", "one hundred and five bucks"
const WORD_AMOUNT = new RegExp(
  `\\b((?:(?:${NUMBER_WORD})(?:[\\s-]+and)?[\\s-]+)*(?:${NUMBER_WORD}))\\s+(?:dollars?|bucks|usd)\\b`,
  'gi',
);

function wordsToNumber(words: string): number {
  let total = 0;
  let current = 0;
  for (const w of words.toLowerCase().split(/[\s-]+/)) {
    if (w in UNITS) current += UNITS[w];
    else if (w in TENS) current += TENS[w];
    else if (w === 'hundred') current = (current || 1) * 100;
    else if (w === 'thousand') {
      total += (current || 1) * 1000;
      current = 0;
    }
  }
  return total + current;
}

/** Every dollar amount mentioned in the text, in cents (digits or spelled out). */
export function extractAmountsCents(text: string): Cents[] {
  const found: Cents[] = [];
  for (const re of [DOLLAR_SIGN, DOLLAR_WORD]) {
    for (const m of text.matchAll(re)) found.push(toCents(m[1], m[2]));
  }
  for (const m of text.matchAll(WORD_AMOUNT)) found.push(wordsToNumber(m[1]) * 100);
  for (const m of text.matchAll(/\b(\d{1,3}(?:,\d{3})+|\d+)\s*cents?\b/gi)) {
    found.push(Number.parseInt(m[1].replace(/,/g, ''), 10));
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
