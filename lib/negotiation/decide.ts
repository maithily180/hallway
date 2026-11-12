import type { Cents, ParsedOffer, Policy } from '@/lib/contracts';

export interface NegotiationState {
  /** Rounds already counted (a counter, accept or decline each count; a hold does not). */
  round: number;
  lastCounterCents?: Cents;
}

export type Decision = {
  action: 'counter' | 'accept' | 'hold' | 'needs_seller' | 'decline';
  /** counter: our price. accept: the agreed price. hold: the price we restate. */
  priceCents: Cents;
  /** Whether this turn consumes one of the policy's rounds. */
  countsRound: boolean;
};

const HOUR = 3_600_000;
const DEADLINE_PRESSURE_MS = 24 * HOUR;

/**
 * Share of the list-to-floor gap conceded, at evenly spaced points from the
 * first round to the last. Linear between points. Best price concedes slowly,
 * sell fast concedes early.
 */
const CURVES = {
  best_price: [0, 0.25, 0.65, 1],
  sell_fast: [0, 0.5, 0.85, 1],
} as const;

const roundToDollar = (cents: Cents): Cents => Math.round(cents / 100) * 100;

function curveShare(points: readonly number[], t: number): number {
  const pos = Math.min(Math.max(t, 0), 1) * (points.length - 1);
  const i = Math.floor(pos);
  if (i >= points.length - 1) return points[points.length - 1];
  return points[i] + (points[i + 1] - points[i]) * (pos - i);
}

function chooseCurve(policy: Policy, now: Date) {
  if (policy.strategy === 'sell_fast') return CURVES.sell_fast;
  if (policy.strategy === 'best_price') return CURVES.best_price;
  // auto: hurry up when the deadline is within three days
  const left = policy.deadline ? Date.parse(policy.deadline) - now.getTime() : Infinity;
  return left <= 72 * HOUR ? CURVES.sell_fast : CURVES.best_price;
}

/** Our asking price for a given round. Always within [floor, list]. */
export function counterPrice(policy: Policy, round: number, now: Date): Cents {
  const { listPriceCents: list, floorCents: floor } = policy;
  const t = round / Math.max(policy.maxRounds, 1);
  const share = curveShare(chooseCurve(policy, now), t);
  const price = roundToDollar(list - (list - floor) * share);
  return Math.min(list, Math.max(floor, price));
}

function isFinalRound(policy: Policy, nextRound: number, now: Date): boolean {
  if (nextRound >= policy.maxRounds) return true;
  if (!policy.deadline) return false;
  return Date.parse(policy.deadline) - now.getTime() <= DEADLINE_PRESSURE_MS;
}

/**
 * Pure negotiation decision. Never returns a price below the floor for a
 * counter, and only accepts offers at or above the floor.
 */
export function decide(
  policy: Policy,
  state: NegotiationState,
  parsed: ParsedOffer,
  now: Date,
): Decision {
  const { listPriceCents: list, floorCents: floor, autoAcceptCents: auto } = policy;
  const standing = state.lastCounterCents ?? list;

  if (parsed.intent === 'accept' && state.lastCounterCents !== undefined) {
    return { action: 'accept', priceCents: standing, countsRound: true };
  }

  const offer = parsed.offerCents;
  if (offer === null || parsed.intent === 'question' || parsed.intent === 'other') {
    return { action: 'hold', priceCents: standing, countsRound: false };
  }

  if (offer >= auto) {
    return { action: 'accept', priceCents: Math.min(offer, list), countsRound: true };
  }
  if (offer >= standing) {
    return { action: 'accept', priceCents: standing, countsRound: true };
  }

  if (policy.mode === 'ask_me' && offer >= floor) {
    return { action: 'needs_seller', priceCents: offer, countsRound: true };
  }

  const nextRound = state.round + 1;
  if (isFinalRound(policy, nextRound, now)) {
    if (offer >= floor) return { action: 'accept', priceCents: offer, countsRound: true };
    return { action: 'decline', priceCents: standing, countsRound: true };
  }

  const ours = Math.min(standing, counterPrice(policy, nextRound, now));
  if (offer >= ours) return { action: 'accept', priceCents: offer, countsRound: true };
  return { action: 'counter', priceCents: ours, countsRound: true };
}
