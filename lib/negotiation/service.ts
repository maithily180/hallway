import {
  PolicySchema,
  type LlmApi,
  type NegoMessage,
  type Negotiation,
  type Policy,
  type PolicyView,
} from '@/lib/contracts';
import { toPolicyView } from './phrase';
import type { NegotiationStore } from './store';
import { runTurn } from './turn';

export class NegotiationError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 403 | 404 | 409,
  ) {
    super(message);
  }
}

/** Floor <= auto-accept <= list, all positive; the engine relies on this ordering. */
export function validatePolicy(input: unknown): Policy {
  const p = PolicySchema.parse(input);
  if (p.floorCents <= 0) throw new NegotiationError('floor must be positive', 400);
  if (p.floorCents > p.autoAcceptCents || p.autoAcceptCents > p.listPriceCents) {
    throw new NegotiationError('need floor <= auto-accept <= list price', 400);
  }
  return p;
}

export interface ServiceDeps {
  store: NegotiationStore;
  llm: LlmApi;
  now?: () => Date;
  /** Called once when a negotiation closes as agreed; the deal engine creates the Deal here. */
  onAgreed?: (negotiation: Negotiation) => Promise<{ dealId: string } | void>;
}

export function createNegotiationService({ store, llm, now = () => new Date(), onAgreed }: ServiceDeps) {
  async function mustGet(id: string): Promise<Negotiation> {
    const n = await store.getNegotiation(id);
    if (!n) throw new NegotiationError('negotiation not found', 404);
    return n;
  }

  return {
    async createOrUpdatePolicy(input: unknown, actingUserId?: string): Promise<Policy> {
      const policy = validatePolicy(input);
      const owner = await store.getListingOwner(policy.listingId);
      if (owner && actingUserId && owner.ownerId !== actingUserId) {
        throw new NegotiationError('only the listing owner can set the policy', 403);
      }
      return store.upsertPolicy(policy);
    },

    async getPolicyView(listingId: string): Promise<PolicyView> {
      const policy = await store.getPolicy(listingId);
      if (!policy) throw new NegotiationError('no policy for listing', 404);
      return toPolicyView(policy);
    },

    async startNegotiation(
      listingId: string,
      buyerId: string,
      kind: 'sale' | 'rent',
      rentDays?: number,
    ): Promise<Negotiation> {
      const owner = await store.getListingOwner(listingId);
      if (!owner) throw new NegotiationError('listing not found', 404);
      if (owner.ownerId === buyerId) throw new NegotiationError('cannot negotiate with yourself', 400);
      if (!(await store.getPolicy(listingId))) {
        throw new NegotiationError('seller has not set a policy', 409);
      }
      if (kind === 'rent' && (!rentDays || rentDays < 1 || rentDays > 29)) {
        throw new NegotiationError('rentDays must be 1-29', 400);
      }
      return store.createNegotiation({ listingId, buyerId, kind, rentDays });
    },

    async getNegotiation(id: string) {
      return { negotiation: await mustGet(id), messages: await store.listMessages(id) };
    },

    async handleBuyerMessage(
      negotiationId: string,
      text: string,
    ): Promise<{ negotiation: Negotiation; messages: NegoMessage[] }> {
      const body = text.trim();
      if (!body || body.length > 1000) throw new NegotiationError('message must be 1-1000 characters', 400);

      const negotiation = await mustGet(negotiationId);
      if (negotiation.status !== 'open') {
        throw new NegotiationError(`negotiation is ${negotiation.status}`, 409);
      }
      const policy = await store.getPolicy(negotiation.listingId);
      if (!policy) throw new NegotiationError('seller has not set a policy', 409);

      const result = await runTurn({
        llm,
        policy,
        state: { round: negotiation.round, lastCounterCents: negotiation.lastCounterCents },
        buyerText: body,
        now: now(),
      });

      const buyerMsg = await store.addMessage({
        negotiationId,
        from: 'buyer',
        text: body,
        parsedOffer: result.parsed,
        blockedReason: result.blockedReason,
      });
      const agentMsg = await store.addMessage({ negotiationId, from: 'agent', text: result.reply });

      let updated = await store.updateNegotiation(negotiationId, {
        round: result.nextState.round,
        lastCounterCents: result.nextState.lastCounterCents,
        agreedCents: result.agreedCents,
        status: result.status,
      });

      if (result.status === 'agreed' && onAgreed) {
        const deal = await onAgreed(updated);
        if (deal) updated = await store.updateNegotiation(negotiationId, { dealId: deal.dealId });
      }

      return { negotiation: updated, messages: [buyerMsg, agentMsg] };
    },
  };
}

export type NegotiationService = ReturnType<typeof createNegotiationService>;
