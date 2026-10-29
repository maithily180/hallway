import { describe, expect, it } from 'vitest';
import { PolicySchema, PolicyViewSchema } from '@/lib/contracts';

const policy = {
  listingId: 'l1',
  listPriceCents: 4000,
  floorCents: 2500,
  autoAcceptCents: 3400,
  mode: 'full_auto',
  strategy: 'best_price',
  tone: 'friendly',
  extrasAllowed: [],
} as const;

describe('PolicyView', () => {
  it('strips floor and auto-accept', () => {
    const view = PolicyViewSchema.parse(PolicySchema.parse(policy));
    expect(view).not.toHaveProperty('floorCents');
    expect(view).not.toHaveProperty('autoAcceptCents');
  });

  it('defaults maxRounds to 4', () => {
    expect(PolicySchema.parse(policy).maxRounds).toBe(4);
  });
});
