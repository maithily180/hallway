import { describe, expect, it } from 'vitest';
import type { ParsedOffer, Policy } from '@/lib/contracts';
import { counterPrice, decide, type NegotiationState } from '@/lib/negotiation/decide';

const now = new Date('2026-11-04T12:00:00Z');
const $ = (dollars: number) => dollars * 100;

const policy = (over: Partial<Policy> = {}): Policy => ({
  listingId: 'projector',
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

const offer = (dollars: number | null, intent: ParsedOffer['intent'] = 'offer'): ParsedOffer => ({
  offerCents: dollars === null ? null : $(dollars),
  conditions: [],
  intent,
});

describe('demo script (CONTRACTS section 7)', () => {
  it('$15 -> $36, injection holds, $26 -> $30, $28 closes', () => {
    const p = policy();
    let state: NegotiationState = { round: 0 };

    const r1 = decide(p, state, offer(15), now);
    expect(r1).toMatchObject({ action: 'counter', priceCents: $(36), countsRound: true });
    state = { round: 1, lastCounterCents: r1.priceCents };

    const injection = decide(p, state, offer(null, 'other'), now);
    expect(injection).toMatchObject({ action: 'hold', priceCents: $(36), countsRound: false });

    const r2 = decide(p, state, offer(26), now);
    expect(r2).toMatchObject({ action: 'counter', priceCents: $(30) });
    state = { round: 2, lastCounterCents: r2.priceCents };

    const r3 = decide(p, state, offer(28), now);
    expect(r3).toMatchObject({ action: 'accept', priceCents: $(28) });
  });
});

describe('floor', () => {
  it('never counters below the floor on any round or strategy', () => {
    for (const strategy of ['sell_fast', 'best_price', 'auto'] as const) {
      for (let maxRounds = 1; maxRounds <= 8; maxRounds++) {
        const p = policy({ strategy, maxRounds });
        for (let round = 1; round <= maxRounds; round++) {
          expect(counterPrice(p, round, now)).toBeGreaterThanOrEqual(p.floorCents);
          expect(counterPrice(p, round, now)).toBeLessThanOrEqual(p.listPriceCents);
        }
      }
    }
  });

  it('never accepts below the floor, over random offers and states', () => {
    const p = policy();
    for (let i = 0; i < 2000; i++) {
      const o = Math.floor(Math.random() * 6000);
      const round = Math.floor(Math.random() * 5);
      const last = Math.random() < 0.5 ? undefined : $(25 + Math.floor(Math.random() * 16));
      const d = decide(p, { round, lastCounterCents: last }, { offerCents: o, conditions: [], intent: 'offer' }, now);
      if (d.action === 'accept' || d.action === 'counter') {
        expect(d.priceCents).toBeGreaterThanOrEqual(p.floorCents);
      }
    }
  });

  it('declines a below-floor offer on the last round', () => {
    const d = decide(policy(), { round: 2, lastCounterCents: $(30) }, offer(20), now);
    expect(d.action).toBe('decline');
    expect(d.priceCents).toBe($(30));
  });

  it('does not accept a below-floor offer just because rounds ran out', () => {
    const d = decide(policy({ maxRounds: 1 }), { round: 0 }, offer(24.99), now);
    expect(d.action).toBe('decline');
  });

  it('accepts exactly the floor on the last round', () => {
    const d = decide(policy(), { round: 2, lastCounterCents: $(30) }, offer(25), now);
    expect(d).toMatchObject({ action: 'accept', priceCents: $(25) });
  });
});

describe('auto-accept and matching', () => {
  it('accepts at or above auto-accept immediately', () => {
    expect(decide(policy(), { round: 0 }, offer(34), now)).toMatchObject({
      action: 'accept',
      priceCents: $(34),
    });
  });

  it('caps an offer above list at the list price', () => {
    expect(decide(policy(), { round: 0 }, offer(55), now).priceCents).toBe($(40));
  });

  it('accepts when the buyer meets our standing counter', () => {
    const d = decide(policy(), { round: 1, lastCounterCents: $(36) }, offer(36), now);
    expect(d).toMatchObject({ action: 'accept', priceCents: $(36) });
  });

  it('accepts the standing counter when the buyer says yes', () => {
    const d = decide(policy(), { round: 1, lastCounterCents: $(36) }, offer(null, 'accept'), now);
    expect(d).toMatchObject({ action: 'accept', priceCents: $(36) });
  });

  it('does not treat "accept" as a deal before any counter exists', () => {
    expect(decide(policy(), { round: 0 }, offer(null, 'accept'), now).action).toBe('hold');
  });
});

describe('counters', () => {
  it('never raises our own counter', () => {
    const d = decide(policy(), { round: 1, lastCounterCents: $(29) }, offer(10), now);
    expect(d.priceCents).toBeLessThanOrEqual($(29));
  });

  it('holds on questions and non-offers without using a round', () => {
    for (const intent of ['question', 'other'] as const) {
      const d = decide(policy(), { round: 1, lastCounterCents: $(36) }, offer(null, intent), now);
      expect(d).toMatchObject({ action: 'hold', priceCents: $(36), countsRound: false });
    }
  });

  it('holds at list price before any counter', () => {
    expect(decide(policy(), { round: 0 }, offer(null, 'question'), now).priceCents).toBe($(40));
  });
});

describe('strategies', () => {
  it('sell_fast concedes more than best_price in round 1', () => {
    const fast = counterPrice(policy({ strategy: 'sell_fast' }), 1, now);
    const best = counterPrice(policy({ strategy: 'best_price' }), 1, now);
    expect(fast).toBeLessThan(best);
  });

  it('auto behaves like best_price when the deadline is far', () => {
    const far = '2026-12-01T00:00:00Z';
    expect(counterPrice(policy({ strategy: 'auto', deadline: far }), 1, now)).toBe(
      counterPrice(policy({ strategy: 'best_price' }), 1, now),
    );
  });

  it('auto behaves like sell_fast when the deadline is near', () => {
    const near = '2026-11-06T12:00:00Z';
    expect(counterPrice(policy({ strategy: 'auto', deadline: near }), 1, now)).toBe(
      counterPrice(policy({ strategy: 'sell_fast' }), 1, now),
    );
  });
});

describe('deadline pressure', () => {
  it('treats the turn as final within 24 hours of the deadline', () => {
    const p = policy({ deadline: '2026-11-05T00:00:00Z', maxRounds: 5 });
    expect(decide(p, { round: 0 }, offer(26), now)).toMatchObject({ action: 'accept' });
    expect(decide(p, { round: 0 }, offer(20), now).action).toBe('decline');
  });

  it('keeps negotiating when the deadline is far away', () => {
    const p = policy({ deadline: '2026-12-01T00:00:00Z', maxRounds: 5 });
    expect(decide(p, { round: 0 }, offer(20), now).action).toBe('counter');
  });
});

describe('ask_me mode', () => {
  it('escalates offers between floor and auto-accept to the seller', () => {
    const p = policy({ mode: 'ask_me' });
    expect(decide(p, { round: 0 }, offer(30), now)).toMatchObject({
      action: 'needs_seller',
      priceCents: $(30),
    });
  });

  it('still auto-accepts at or above auto-accept', () => {
    expect(decide(policy({ mode: 'ask_me' }), { round: 0 }, offer(34), now).action).toBe('accept');
  });

  it('still counters below the floor without bothering the seller', () => {
    expect(decide(policy({ mode: 'ask_me' }), { round: 0 }, offer(15), now).action).toBe('counter');
  });
});
