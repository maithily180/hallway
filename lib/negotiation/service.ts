import { PolicySchema, type NegoMessage, type Negotiation, type Policy, type PolicyView } from '@/lib/contracts';
import { effectivePolicy, isLoanOnly } from './effective-policy';
import type { LlmApi } from './llm-api';
import { toPolicyView } from './phrase';
import type { NegotiationStore } from './store';
import { latestOfferCents } from './theater';
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

const MAX_RENT_DAYS = 29; // a PayPal authorization holds funds for 29 days
// Only counted rounds are limited by the policy, so questions and holds could go on forever, and
// each one is a model call. A negotiation stops accepting messages after this many.
export const MAX_BUYER_MESSAGES = 40;

export function createNegotiationService({ store, llm, now = () => new Date(), onAgreed }: ServiceDeps) {
  async function assertParticipant(n: Negotiation, userId: string) {
    const info = await store.getListingInfo(n.listingId);
    if (userId !== n.buyerId && userId !== info?.ownerId) {
      throw new NegotiationError('not your negotiation', 403);
    }
  }

  async function mustGet(id: string): Promise<Negotiation> {
    const n = await store.getNegotiation(id);
    if (!n) throw new NegotiationError('negotiation not found', 404);
    return n;
  }

  /** A negotiation past the owner's deadline is closed as expired the next time anyone looks at it. */
  async function expireIfDue(n: Negotiation, policy: Policy | null): Promise<Negotiation> {
    const open = n.status === 'open' || n.status === 'needs_seller';
    if (!open || !policy?.deadline || Date.parse(policy.deadline) > now().getTime()) return n;
    return store.updateNegotiation(n.id, { status: 'expired' });
  }

  /** The policy this negotiation actually runs on: scaled to the mode being negotiated. */
  async function policyFor(n: Negotiation): Promise<Policy> {
    const [policy, info] = await Promise.all([store.getPolicy(n.listingId), store.getListingInfo(n.listingId)]);
    if (!policy || !info) throw new NegotiationError('seller has not set a policy', 409);
    return effectivePolicy(policy, info, n.kind);
  }

  async function agree(n: Negotiation): Promise<Negotiation> {
    if (!onAgreed) return n;
    const deal = await onAgreed(n);
    return deal ? store.updateNegotiation(n.id, { dealId: deal.dealId }) : n;
  }

  return {
    async createOrUpdatePolicy(input: unknown, actingUserId?: string): Promise<Policy> {
      const policy = validatePolicy(input);
      const info = await store.getListingInfo(policy.listingId);
      if (actingUserId !== undefined) {
        if (!info) throw new NegotiationError('listing not found', 404);
        if (info.ownerId !== actingUserId) {
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

    /**
     * Start a negotiation. A lend-only listing, or `borrow: true` on one that is also lent, is a
     * free loan: nothing to negotiate, so it starts already agreed at $0 and the deal holds only
     * the deposit.
     */
    async startNegotiation(
      listingId: string,
      buyerId: string,
      kind: 'sale' | 'rent',
      rentDays?: number,
      opts: { borrow?: boolean } = {},
    ): Promise<Negotiation> {
      const info = await store.getListingInfo(listingId);
      if (!info) throw new NegotiationError('listing not found', 404);
      if (info.ownerId === buyerId) throw new NegotiationError('cannot negotiate with yourself', 400);

      const days = rentDays;
      if (kind === 'rent' && (!days || days < 1 || days > MAX_RENT_DAYS)) {
        throw new NegotiationError(`rentDays must be 1-${MAX_RENT_DAYS}`, 400);
      }

      const loan = kind === 'rent' && (opts.borrow === true || isLoanOnly(info));
      if (loan) {
        if (!info.modes.includes('lend')) throw new NegotiationError('this item is not offered as a free loan', 409);
        const n = await store.createNegotiation({
          listingId,
          buyerId,
          kind: 'rent',
          rentDays: days,
          status: 'agreed',
          agreedCents: 0,
        });
        return agree(n);
      }

      if (kind === 'sale' && !info.modes.includes('sell')) throw new NegotiationError('this item is not for sale', 409);
      if (kind === 'rent' && !info.modes.includes('rent')) throw new NegotiationError('this item is not for rent', 409);
      if (!(await store.getPolicy(listingId))) throw new NegotiationError('seller has not set a policy', 409);
      return store.createNegotiation({ listingId, buyerId, kind, rentDays: days });
    },

    /** Only the buyer and the listing owner may read a negotiation (when a viewer is given). */
    async getNegotiation(id: string, viewerId?: string) {
      let negotiation = await mustGet(id);
      if (viewerId !== undefined) await assertParticipant(negotiation, viewerId);
      negotiation = await expireIfDue(negotiation, await store.getPolicy(negotiation.listingId));
      return { negotiation, messages: await store.listMessages(id) };
    },

    /** Everything a user is part of, newest first: what to look at and what is waiting on them. */
    async listFor(userId: string) {
      const all = await store.listNegotiationsFor(userId);
      const rows = [];
      for (const n of all) {
        const info = await store.getListingInfo(n.listingId);
        const negotiation = await expireIfDue(n, await store.getPolicy(n.listingId));
        rows.push({
          negotiation,
          role: info?.ownerId === userId ? ('owner' as const) : ('buyer' as const),
          // "ask me" offers wait for the owner; a buyer waits on the owner too
          needsYou: negotiation.status === 'needs_seller' && info?.ownerId === userId,
        });
      }
      return rows;
    },

    /**
     * Everything the Theater shows. The floor is included ONLY for the listing owner
     * (the locked line on their price ladder); buyers never receive it.
     */
    async getTheaterView(id: string, viewerId?: string) {
      let negotiation = await mustGet(id);
      if (viewerId !== undefined) await assertParticipant(negotiation, viewerId);
      const [messages, info, rawPolicy] = await Promise.all([
        store.listMessages(id),
        store.getListingInfo(negotiation.listingId),
        store.getPolicy(negotiation.listingId),
      ]);
      if (!info) throw new NegotiationError('listing not found', 404);
      negotiation = await expireIfDue(negotiation, rawPolicy);
      const isOwner = !!viewerId && viewerId === info.ownerId;

      // A free loan has nothing to negotiate, so no policy is needed.
      if (negotiation.agreedCents === 0 && negotiation.status === 'agreed') {
        return { negotiation, messages, listPriceCents: 0, ownerId: info.ownerId, floorCents: undefined, mode: 'full_auto' as const };
      }
      if (!rawPolicy) throw new NegotiationError('seller has not set a policy', 409);
      const policy = effectivePolicy(rawPolicy, info, negotiation.kind);
      return {
        negotiation,
        messages,
        listPriceCents: policy.listPriceCents,
        ownerId: info.ownerId,
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
      const info = await store.getListingInfo(negotiation.listingId);
      if (!info || !userId || info.ownerId !== userId) {
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

      const updated = await store.updateNegotiation(
        negotiationId,
        decision === 'accept' ? { status: 'agreed', agreedCents: offer } : { status: 'declined' },
      );
      return { negotiation: decision === 'accept' ? await agree(updated) : updated, messages: [note] };
    },

    async handleBuyerMessage(
      negotiationId: string,
      text: string,
      userId?: string,
    ): Promise<{ negotiation: Negotiation; messages: NegoMessage[] }> {
      const body = text.trim();
      if (!body || body.length > 1000) throw new NegotiationError('message must be 1-1000 characters', 400);

      let negotiation = await mustGet(negotiationId);
      if (userId !== undefined && userId !== negotiation.buyerId) {
        throw new NegotiationError('only the buyer can send offers', 403);
      }
      negotiation = await expireIfDue(negotiation, await store.getPolicy(negotiation.listingId));
      if (negotiation.status !== 'open') {
        throw new NegotiationError(`negotiation is ${negotiation.status}`, 409);
      }
      const sent = (await store.listMessages(negotiationId)).filter((m) => m.from === 'buyer').length;
      if (sent >= MAX_BUYER_MESSAGES) {
        throw new NegotiationError('this negotiation has reached its message limit; start a new one', 409);
      }
      const policy = await policyFor(negotiation);

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

      const updated = await store.updateNegotiation(negotiationId, {
        round: result.nextState.round,
        lastCounterCents: result.nextState.lastCounterCents,
        agreedCents: result.agreedCents,
        status: result.status,
      });

      return {
        negotiation: result.status === 'agreed' ? await agree(updated) : updated,
        messages: [buyerMsg, agentMsg],
      };
    },
  };
}

export type NegotiationService = ReturnType<typeof createNegotiationService>;
