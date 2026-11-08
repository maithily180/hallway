import type { NegoMessage, Negotiation, Policy } from '@/lib/contracts';
import type { ListingRef } from './listing-lookup';

/** The listing facts negotiation needs: who owns it, how it is offered, and at what price. */
export type ListingInfo = Omit<ListingRef, 'sellerPayoutEmail'>;

/** What the negotiation service needs from persistence. Prisma and in-memory implement it. */
export interface NegotiationStore {
  getListingInfo(listingId: string): Promise<ListingInfo | null>;
  /** Negotiations a user is part of: as the buyer, or as the owner of the listing. */
  listNegotiationsFor(userId: string): Promise<Negotiation[]>;
  getPolicy(listingId: string): Promise<Policy | null>;
  upsertPolicy(policy: Policy): Promise<Policy>;
  createNegotiation(input: {
    listingId: string;
    buyerId: string;
    kind: 'sale' | 'rent';
    rentDays?: number;
    /** A free loan starts already agreed, at $0. */
    status?: Negotiation['status'];
    agreedCents?: number;
  }): Promise<Negotiation>;
  getNegotiation(id: string): Promise<Negotiation | null>;
  updateNegotiation(
    id: string,
    patch: Partial<Pick<Negotiation, 'round' | 'lastCounterCents' | 'agreedCents' | 'status' | 'dealId'>>,
  ): Promise<Negotiation>;
  addMessage(msg: Omit<NegoMessage, 'id' | 'createdAt'>): Promise<NegoMessage>;
  listMessages(negotiationId: string): Promise<NegoMessage[]>;
}
