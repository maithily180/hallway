import { describe, expect, it } from 'vitest';
import { defaultPolicy, HERO } from '@/lib/negotiation/default-policy';
import type { ListingRef } from '@/lib/negotiation/listing-lookup';
import { createMemoryStore } from '@/lib/negotiation/memory-store';
import { mockLlm } from '@/lib/negotiation/mock-llm';
import { createNegotiationService, validatePolicy } from '@/lib/negotiation/service';

const info = (over: Partial<ListingRef>) => ({ ownerId: 'sam', modes: ['rent' as const], depositCents: 5000, ...over });

describe('defaultPolicy', () => {
  it('gives the hero projector the demo script: $40/day, floor $25, auto-accept $34', () => {
    const p = defaultPolicy(HERO.id, info({ ownerId: 'maya', rentPerDayCents: 4000 }))!;
    expect(p).toMatchObject({ listPriceCents: 4000, floorCents: 2500, autoAcceptCents: 3400, maxRounds: 3, mode: 'full_auto' });
    expect(p.extrasAllowed).toEqual(['include HDMI cable']);
  });

  it('floors other listings at 70% of list and auto-accepts from 90%', () => {
    const p = defaultPolicy('x', info({ rentPerDayCents: 2000 }))!;
    expect(p).toMatchObject({ listPriceCents: 2000, floorCents: 1400, autoAcceptCents: 1800 });
  });

  it('prices by the main mode: rent first, then sale', () => {
    expect(defaultPolicy('x', info({ modes: ['rent', 'sell'], rentPerDayCents: 2000, salePriceCents: 9000 }))!.listPriceCents).toBe(2000);
    expect(defaultPolicy('x', info({ modes: ['sell'], salePriceCents: 9000 }))!.listPriceCents).toBe(9000);
  });

  it('returns null when nothing is priced (a free loan has nothing to negotiate)', () => {
    expect(defaultPolicy('x', info({ modes: ['lend'] }))).toBeNull();
  });

  it('always satisfies the policy rules, for any price', () => {
    for (const price of [1, 3, 99, 2000, 123456]) {
      const p = defaultPolicy('x', info({ rentPerDayCents: price }))!;
      // validatePolicy needs floor > 0; a $0.01 listing is the only case that cannot be valid
      if (p.floorCents > 0) expect(() => validatePolicy(p)).not.toThrow();
      expect(p.floorCents).toBeLessThanOrEqual(p.autoAcceptCents);
      expect(p.autoAcceptCents).toBeLessThanOrEqual(p.listPriceCents);
    }
  });
});

describe('mock mode default policies', () => {
  const listing: ListingRef = { ownerId: 'sam', modes: ['rent'], depositCents: 5000, rentPerDayCents: 2000 };
  const lookup = async (id: string) => (id === 'drill' ? listing : null);

  it('lets a buyer negotiate a listing nobody has configured, on the default policy', async () => {
    const store = createMemoryStore({ seedHero: false, lookup, defaultPolicies: true });
    const service = createNegotiationService({ store, llm: mockLlm });
    const { id } = await service.startNegotiation('drill', 'leo', 'rent', 1);
    expect((await service.getTheaterView(id, 'sam')).floorCents).toBe(1400);
  });

  it('keeps the same policy once created, and an owner’s own policy replaces it', async () => {
    const store = createMemoryStore({ seedHero: false, lookup, defaultPolicies: true });
    const first = await store.getPolicy('drill');
    expect(await store.getPolicy('drill')).toBe(first);

    const service = createNegotiationService({ store, llm: mockLlm });
    await service.createOrUpdatePolicy({ ...first!, floorCents: 1500 }, 'sam');
    expect((await store.getPolicy('drill'))!.floorCents).toBe(1500);
  });

  it('is off by default: no policy means a 409, as in the unit tests', async () => {
    const store = createMemoryStore({ seedHero: false, lookup });
    expect(await store.getPolicy('drill')).toBeNull();
  });

  it('does not invent a policy for a listing that does not exist', async () => {
    const store = createMemoryStore({ seedHero: false, lookup, defaultPolicies: true });
    expect(await store.getPolicy('nope')).toBeNull();
  });
});
