import { describe, expect, it } from 'vitest';
import type { Deal } from '@/lib/contracts';
import { InvalidTransitionError, canTransition, transition } from '@/lib/engine/transition';

const now = new Date('2026-11-04T19:00:00Z');

const deal = (over: Partial<Deal>): Deal => ({
  id: 'd1',
  listingId: 'l1',
  buyerId: 'leo',
  sellerId: 'maya',
  type: 'rent',
  amountCents: 2800,
  depositCents: 15000,
  state: 'AGREED',
  paypal: { captureIds: [] },
  timeline: [],
  ...over,
});

describe('rent state machine', () => {
  it('walks the happy path to SETTLED', () => {
    let d = deal({});
    for (const s of ['AWAITING_PAYMENT', 'HELD', 'OUT', 'RETURNED', 'SETTLED'] as const) {
      d = transition(d, s, now);
    }
    expect(d.state).toBe('SETTLED');
    expect(d.timeline.map((t) => t.state)).toEqual([
      'AWAITING_PAYMENT',
      'HELD',
      'OUT',
      'RETURNED',
      'SETTLED',
    ]);
  });

  it('supports the damage claim path', () => {
    let d = deal({ state: 'RETURNED' });
    d = transition(d, 'CLAIMED', now);
    d = transition(d, 'SETTLED', now);
    expect(d.state).toBe('SETTLED');
  });

  it('voids before pickup but not after', () => {
    expect(canTransition('rent', 'HELD', 'VOIDED')).toBe(true);
    expect(canTransition('rent', 'OUT', 'VOIDED')).toBe(false);
  });

  it('rejects skipping states', () => {
    expect(() => transition(deal({}), 'OUT', now)).toThrow(InvalidTransitionError);
    expect(() => transition(deal({ state: 'HELD' }), 'SETTLED', now)).toThrow(
      InvalidTransitionError,
    );
  });

  it('treats terminal states as final', () => {
    for (const s of ['SETTLED', 'VOIDED', 'REFUNDED'] as const) {
      expect(() => transition(deal({ state: s }), 'OUT', now)).toThrow(InvalidTransitionError);
    }
  });
});

describe('sale state machine', () => {
  it('goes AGREED -> PAID -> SETTLED', () => {
    let d = deal({ type: 'sale', depositCents: 0 });
    for (const s of ['AWAITING_PAYMENT', 'PAID', 'SETTLED'] as const) d = transition(d, s, now);
    expect(d.state).toBe('SETTLED');
  });

  it('can refund after payment', () => {
    expect(canTransition('sale', 'PAID', 'REFUNDED')).toBe(true);
  });

  it('has no rental states', () => {
    expect(canTransition('sale', 'AWAITING_PAYMENT', 'HELD')).toBe(false);
    expect(canTransition('sale', 'PAID', 'OUT')).toBe(false);
  });
});

describe('idempotency', () => {
  it('returns the same deal when the state repeats (retried webhook)', () => {
    const d = transition(deal({}), 'AWAITING_PAYMENT', now);
    expect(transition(d, 'AWAITING_PAYMENT', now)).toBe(d);
  });

  it('records the PayPal reference on the timeline', () => {
    const d = transition(deal({ state: 'AWAITING_PAYMENT' }), 'HELD', now, 'AUTH-123');
    expect(d.timeline.at(-1)).toMatchObject({ state: 'HELD', paypalRef: 'AUTH-123' });
  });
});
