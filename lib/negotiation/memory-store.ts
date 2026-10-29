import { randomUUID } from 'node:crypto';
import type { NegoMessage, Negotiation, Policy } from '@/lib/contracts';
import type { NegotiationStore } from './store';

export const HERO_LISTING_ID = 'listing-projector';

/** In-memory store for tests and no-database mock mode, seeded with the hero projector. */
export function createMemoryStore(opts: { seedHero?: boolean } = { seedHero: true }): NegotiationStore {
  const policies = new Map<string, Policy>();
  const negotiations = new Map<string, Negotiation>();
  const messages = new Map<string, NegoMessage[]>();
  const owners = new Map<string, string>();

  if (opts.seedHero) {
    owners.set(HERO_LISTING_ID, 'maya');
    policies.set(HERO_LISTING_ID, {
      listingId: HERO_LISTING_ID,
      listPriceCents: 4000,
      floorCents: 2500,
      autoAcceptCents: 3400,
      mode: 'full_auto',
      strategy: 'best_price',
      maxRounds: 3,
      tone: 'friendly',
      extrasAllowed: ['include HDMI cable'],
    });
  }

  return {
    async getListingOwner(listingId) {
      const ownerId = owners.get(listingId);
      return ownerId ? { ownerId } : null;
    },
    async getPolicy(listingId) {
      return policies.get(listingId) ?? null;
    },
    async upsertPolicy(policy) {
      policies.set(policy.listingId, policy);
      if (!owners.has(policy.listingId)) owners.set(policy.listingId, 'unknown');
      return policy;
    },
    async createNegotiation(input) {
      const n: Negotiation = { id: randomUUID(), round: 0, status: 'open', ...input };
      negotiations.set(n.id, n);
      messages.set(n.id, []);
      return n;
    },
    async getNegotiation(id) {
      return negotiations.get(id) ?? null;
    },
    async updateNegotiation(id, patch) {
      const current = negotiations.get(id);
      if (!current) throw new Error(`Negotiation ${id} not found`);
      const next = { ...current, ...patch };
      negotiations.set(id, next);
      return next;
    },
    async addMessage(msg) {
      const m: NegoMessage = { id: randomUUID(), createdAt: new Date().toISOString(), ...msg };
      messages.get(msg.negotiationId)?.push(m);
      return m;
    },
    async listMessages(negotiationId) {
      return [...(messages.get(negotiationId) ?? [])];
    },
  };
}
