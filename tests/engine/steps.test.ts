import { describe, expect, it } from 'vitest';
import type { Deal, DealState } from '@/lib/contracts';
import { stepsFor } from '@/components/deal/steps';

const deal = (type: Deal['type'], states: DealState[]): Deal => ({
  id: 'd1',
  listingId: 'l1',
  buyerId: 'leo',
  sellerId: 'maya',
  type,
  amountCents: 2800,
  depositCents: type === 'sale' ? 0 : 15000,
  state: states[states.length - 1],
  paypal: { captureIds: [] },
  timeline: states.map((state) => ({ state, at: '2026-11-04T19:00:00Z' })),
});

const titles = (d: Deal) => stepsFor(d).map((s) => s.state);

describe('stepsFor', () => {
  it('shows the whole rental path, with the hold amount at HELD', () => {
    const steps = stepsFor(deal('rent', ['AGREED', 'AWAITING_PAYMENT', 'HELD']));
    expect(steps.map((s) => s.state)).toEqual(['AGREED', 'AWAITING_PAYMENT', 'HELD', 'OUT', 'RETURNED', 'SETTLED']);
    expect(steps.find((s) => s.state === 'HELD')?.detail).toContain('$178');
  });

  it('shows the short sale path', () => {
    expect(titles(deal('sale', ['AGREED']))).toEqual(['AGREED', 'AWAITING_PAYMENT', 'PAID', 'SETTLED']);
  });

  it('ends a cancelled hold at VOIDED without future steps', () => {
    expect(titles(deal('rent', ['AGREED', 'AWAITING_PAYMENT', 'HELD', 'VOIDED']))).toEqual([
      'AGREED',
      'AWAITING_PAYMENT',
      'HELD',
      'VOIDED',
    ]);
  });

  it('shows a refund as the end of a sale', () => {
    expect(titles(deal('sale', ['AGREED', 'AWAITING_PAYMENT', 'PAID', 'REFUNDED']))).toEqual([
      'AGREED',
      'AWAITING_PAYMENT',
      'PAID',
      'REFUNDED',
    ]);
  });

  it('puts a damage claim between RETURNED and SETTLED', () => {
    const states: DealState[] = ['AGREED', 'AWAITING_PAYMENT', 'HELD', 'OUT', 'RETURNED', 'CLAIMED'];
    expect(titles(deal('rent', states))).toEqual([
      'AGREED',
      'AWAITING_PAYMENT',
      'HELD',
      'OUT',
      'RETURNED',
      'CLAIMED',
      'SETTLED',
    ]);
  });
});
