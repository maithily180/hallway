import { describe, expect, it } from 'vitest';
import type { Policy } from '@/lib/contracts';
import { decide } from '@/lib/negotiation/decide';
import { effectivePolicy, isLoanOnly } from '@/lib/negotiation/effective-policy';
import type { ListingInfo } from '@/lib/negotiation/store';

const $ = (d: number) => d * 100;

const policy = (over: Partial<Policy> = {}): Policy => ({
  listingId: 'x',
  listPriceCents: $(40),
  floorCents: $(25),
  autoAcceptCents: $(34),
  mode: 'full_auto',
  strategy: 'best_price',
  maxRounds: 3,
  tone: 'friendly',
  extrasAllowed: [],
  ...over,
});

const both: ListingInfo = { ownerId: 'maya', modes: ['rent', 'sell'], depositCents: $(150), rentPerDayCents: $(40), salePriceCents: $(180) };

describe('effectivePolicy', () => {
  it('leaves the policy alone for the mode it is written against', () => {
    const p = policy();
    expect(effectivePolicy(p, both, 'rent')).toBe(p);
  });

  it('scales floor and auto-accept in proportion for the other mode', () => {
    const sale = effectivePolicy(policy(), both, 'sale'); // $40/day policy, $180 sale price: ratio 4.5
    expect(sale).toMatchObject({ listPriceCents: $(180), floorCents: $(112.5), autoAcceptCents: $(153) });
    // the owner's intent is the same proportion of list
    expect(sale.floorCents / sale.listPriceCents).toBeCloseTo(25 / 40);
  });

  it('works the other way: a sale-priced policy used for a rental', () => {
    const p = policy({ listPriceCents: $(180), floorCents: $(120), autoAcceptCents: $(150) });
    const rent = effectivePolicy(p, both, 'rent');
    expect(rent.listPriceCents).toBe($(40));
    expect(rent.floorCents).toBeLessThanOrEqual(rent.autoAcceptCents);
    expect(rent.autoAcceptCents).toBeLessThanOrEqual(rent.listPriceCents);
  });

  it('keeps floor <= auto-accept <= list for awkward inputs', () => {
    for (const list of [1, 7, 100, 12345]) {
      for (const f of [0.01, 0.5, 1]) {
        const p = policy({ listPriceCents: $(40), floorCents: Math.round($(40) * f), autoAcceptCents: Math.round($(40) * Math.max(f, 0.9)) });
        const e = effectivePolicy(p, { ...both, salePriceCents: list }, 'sale');
        expect(e.floorCents).toBeGreaterThanOrEqual(1);
        expect(e.floorCents).toBeLessThanOrEqual(e.autoAcceptCents);
        expect(e.autoAcceptCents).toBeLessThanOrEqual(e.listPriceCents);
      }
    }
  });

  it('uses the policy as is when the listing has no price for that mode', () => {
    const p = policy();
    expect(effectivePolicy(p, { ...both, salePriceCents: undefined }, 'sale')).toBe(p);
  });

  it('assumes the main mode when the owner picked their own list price', () => {
    const p = policy({ listPriceCents: $(45), floorCents: $(30), autoAcceptCents: $(40) }); // matches neither price
    expect(effectivePolicy(p, both, 'rent')).toBe(p); // rent is the main mode
    expect(effectivePolicy(p, both, 'sale').listPriceCents).toBe($(180));
  });

  it('still never lets decide() cross the scaled floor', () => {
    const sale = effectivePolicy(policy(), both, 'sale');
    const now = new Date('2026-11-04T12:00:00Z');
    for (let offer = 0; offer <= $(200); offer += 137) {
      const d = decide(sale, { round: 2, lastCounterCents: $(160) }, { offerCents: offer, conditions: [], intent: 'offer' }, now);
      if (d.action === 'accept' || d.action === 'counter') expect(d.priceCents).toBeGreaterThanOrEqual(sale.floorCents);
    }
  });
});

describe('isLoanOnly', () => {
  it('is true for lend-only listings, false when it can also be rented', () => {
    expect(isLoanOnly({ modes: ['lend'] })).toBe(true);
    expect(isLoanOnly({ modes: ['sell', 'lend'] })).toBe(true);
    expect(isLoanOnly({ modes: ['rent', 'lend'] })).toBe(false);
  });
});
