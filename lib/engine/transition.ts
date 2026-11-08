import type { Deal, DealState, DealType } from '@/lib/contracts';

const SALE: Partial<Record<DealState, DealState[]>> = {
  AGREED: ['AWAITING_PAYMENT', 'VOIDED'],
  AWAITING_PAYMENT: ['PAID', 'VOIDED'],
  PAID: ['SETTLED', 'REFUNDED'],
};

const RENT: Partial<Record<DealState, DealState[]>> = {
  AGREED: ['AWAITING_PAYMENT', 'VOIDED'],
  AWAITING_PAYMENT: ['HELD', 'VOIDED'],
  HELD: ['OUT', 'VOIDED'],
  OUT: ['RETURNED', 'CLAIMED'], // CLAIMED from OUT: the item was never returned
  RETURNED: ['SETTLED', 'CLAIMED'],
  CLAIMED: ['SETTLED'],
};

const GRAPHS: Record<DealType, Partial<Record<DealState, DealState[]>>> = {
  sale: SALE,
  rent: RENT,
  borrow: RENT,
};

export class InvalidTransitionError extends Error {
  override name = 'InvalidTransitionError';
  constructor(type: DealType, from: DealState, to: DealState) {
    super(`Invalid ${type} transition ${from} -> ${to}`);
  }
}

export function canTransition(type: DealType, from: DealState, to: DealState): boolean {
  return GRAPHS[type][from]?.includes(to) ?? false;
}

/**
 * The only way a deal's state changes. Pure: returns a new Deal.
 * Repeating the current state is a no-op, so retried webhooks are harmless.
 */
export function transition(deal: Deal, to: DealState, at: Date, paypalRef?: string): Deal {
  if (deal.state === to) return deal;
  if (!canTransition(deal.type, deal.state, to)) {
    throw new InvalidTransitionError(deal.type, deal.state, to);
  }
  return {
    ...deal,
    state: to,
    timeline: [
      ...deal.timeline,
      { state: to, at: at.toISOString(), ...(paypalRef ? { paypalRef } : {}) },
    ],
  };
}
