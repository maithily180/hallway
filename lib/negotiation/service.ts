import { PolicySchema, type NegoMessage, type Negotiation, type Policy, type PolicyView } from '@/lib/contracts';
import type { LlmApi } from '@/lib/negotiation/llm-api';
import { toPolicyView } from './phrase';
import { latestOfferCents } from './theater';
import type { NegotiationStore } from './store';
import { runTurn } from './turn';

export class NegotiationError extends Error {
  override name = 'NegotiationError';
  constructor(
    message: string,
    readonly status: 400 | 401 | 403 | 404 | 409,
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
  async function assertParticipant(n: Negotiation, userId: string) {
    const owner = await store.getListingOwner(n.listingId);
    if (userId !== n.buyerId && userId !== owner?.ownerId) {
      throw new NegotiationError('not your negotiation', 403);
    }
  }

  async function mustGet(id: string): Promise<Negotiation> {
    const n = await store.getNegotiation(id);
    if (!n) throw new NegotiationError('negotiation not found', 404);
    return n;
  }

  return {
    async createOrUpdatePolicy(input: unknown, actingUserId?: string): Promise<Policy> {
      const policy = validatePolicy(input);
      const owner = await store.getListingOwner(policy.listingId);
      if (actingUserId !== undefined) {
        if (!owner) throw new NegotiationError('listing not found', 404);
        if (owner.ownerId !== actingUserId) {
          throw new NegotiationError('only the listing owner can set the policy', 403);
        }
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

    /** Only the buyer and the listing owner may read a negotiation (when a viewer is given). */
    async getNegotiation(id: string, viewerId?: string) {
      const negotiation = await mustGet(id);
      if (viewerId !== undefined) await assertParticipant(negotiation, viewerId);
      return { negotiation, messages: await store.listMessages(id) };
    },

    /**
     * Everything the Theater shows. The floor is included ONLY for the listing owner
     * (the locked line on their price ladder); buyers never receive it.
     */
    async getTheaterView(id: string, viewerId?: string) {
      const negotiation = await mustGet(id);
      if (viewerId !== undefined) await assertParticipant(negotiation, viewerId);
      const [messages, policy, owner] = await Promise.all([
        store.listMessages(id),
        store.getPolicy(negotiation.listingId),
        store.getListingOwner(negotiation.listingId),
      ]);
      if (!policy || !owner) throw new NegotiationError('listing not found', 404);
      const isOwner = !!viewerId && viewerId === owner.ownerId;
      return {
        negotiation,
        messages,
        listPriceCents: policy.listPriceCents,
        ownerId: owner.ownerId,
        floorCents: isOwner ? policy.floorCents : undefined,
        mode: policy.mode,
      };
    },

    /** "Ask me" mode: the owner accepts or declines the buyer's latest offer. */
    async sellerDecision(
      negotiationId: string,
      decision: 'accept' | 'decline',
      userId?: string,
    ): Promise<{ negotiation: Negotiation; messages: NegoMessage[] }> {
      const negotiation = await mustGet(negotiationId);
      const owner = await store.getListingOwner(negotiation.listingId);
      if (!owner || !userId || owner.ownerId !== userId) {
        throw new NegotiationError('only the listing owner can decide', 403);
      }
      if (negotiation.status !== 'needs_seller') {
        throw new NegotiationError(`negotiation is ${negotiation.status}`, 409);
      }
      const offer = latestOfferCents(await store.listMessages(negotiationId));
      if (decision === 'accept' && offer === undefined) {
        throw new NegotiationError('there is no offer to accept', 409);
      }

      const text =
        decision === 'accept'
          ? `The seller accepted $${((offer ?? 0) / 100).toFixed((offer ?? 0) % 100 === 0 ? 0 : 2)}.`
          : 'The seller declined this offer.';
      const note = await store.addMessage({ negotiationId, from: 'seller', text });

      let updated = await store.updateNegotiation(
        negotiationId,
        decision === 'accept' ? { status: 'agreed', agreedCents: offer } : { status: 'declined' },
      );
      if (decision === 'accept' && onAgreed) {
        const deal = await onAgreed(updated);
        if (deal) updated = await store.updateNegotiation(negotiationId, { dealId: deal.dealId });
      }
      return { negotiation: updated, messages: [note] };
    },

    async handleBuyerMessage(
      negotiationId: string,
      text: string,
      userId?: string,
    ): Promise<{ negotiation: Negotiation; messages: NegoMessage[] }> {
      const body = text.trim();
      if (!body || body.length > 1000) throw new NegotiationError('message must be 1-1000 characters', 400);

      const negotiation = await mustGet(negotiationId);
      if (userId !== undefined && userId !== negotiation.buyerId) {
        throw new NegotiationError('only the buyer can send offers', 403);
      }
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
