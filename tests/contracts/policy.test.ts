import { describe, expect, it } from 'vitest';
import { PolicySchema, PolicyViewSchema } from '@/lib/contracts';
import { toPolicyView } from '@/lib/negotiation/phrase';

const policy = PolicySchema.parse({
  listingId: 'l1',
  listPriceCents: 4000,
  floorCents: 2500,
  autoAcceptCents: 3400,
  mode: 'full_auto',
  strategy: 'best_price',
  tone: 'friendly',
  extrasAllowed: [],
});

describe('PolicyView', () => {
  it('rejects a policy that still carries the floor or auto-accept (strict schema)', () => {
    expect(PolicyViewSchema.safeParse(policy).success).toBe(false);
  });

  it('toPolicyView strips the secrets and passes the strict schema', () => {
    const view = toPolicyView(policy);
    expect(view).not.toHaveProperty('floorCents');
    expect(view).not.toHaveProperty('autoAcceptCents');
    expect(PolicyViewSchema.safeParse(view).success).toBe(true);
  });

  it('defaults maxRounds to 4', () => {
    expect(policy.maxRounds).toBe(4);
  });
});
