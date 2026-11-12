import { randomUUID } from 'node:crypto';
import type { NegoMessage, Negotiation, Policy } from '@/lib/contracts';
import { defaultPolicy } from './default-policy';
import type { ListingLookup } from './listing-lookup';
import type { ListingInfo, NegotiationStore } from './store';

export const HERO_LISTING_ID = 'hero-projector';

const HERO_INFO: ListingInfo = {
  ownerId: 'maya',
  modes: ['rent'],
  depositCents: 15000,
  rentPerDayCents: 4000,
};

/** In-memory store for tests and no-database mock mode, seeded with the hero projector. */
export function createMemoryStore(
  opts: { seedHero?: boolean; lookup?: ListingLookup; defaultPolicies?: boolean } = { seedHero: true },
): NegotiationStore {
  const policies = new Map<string, Policy>();
  const negotiations = new Map<string, Negotiation>();
  const messages = new Map<string, NegoMessage[]>();
  const infos = new Map<string, ListingInfo>();

  if (opts.seedHero) {
    infos.set(HERO_LISTING_ID, HERO_INFO);
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

  async function getListingInfo(listingId: string): Promise<ListingInfo | null> {
    const ref = await opts.lookup?.(listingId);
    if (ref) {
      const { sellerPayoutEmail, ...info } = ref;
      void sellerPayoutEmail;
      return info;
    }
    return infos.get(listingId) ?? null;
  }

  return {
    getListingInfo,
    async listNegotiationsFor(userId) {
      const out: Negotiation[] = [];
      for (const n of negotiations.values()) {
        if (n.buyerId === userId || (await getListingInfo(n.listingId))?.ownerId === userId) out.push(n);
      }
      return out;
    },
    async getPolicy(listingId) {
      const existing = policies.get(listingId);
      if (existing || !opts.defaultPolicies) return existing ?? null;
      // Mock mode: a listing nobody has set a policy for starts with the default one, kept from then on.
      const info = await getListingInfo(listingId);
      const created = info ? defaultPolicy(listingId, info) : null;
      if (created) policies.set(listingId, created);
      return created;
    },
    async upsertPolicy(policy) {
      policies.set(policy.listingId, policy);
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
