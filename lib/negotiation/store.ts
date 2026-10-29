import type { NegoMessage, Negotiation, Policy } from '@/lib/contracts';

/** What the negotiation service needs from persistence. Prisma and in-memory implement it. */
export interface NegotiationStore {
  getListingOwner(listingId: string): Promise<{ ownerId: string } | null>;
  getPolicy(listingId: string): Promise<Policy | null>;
  upsertPolicy(policy: Policy): Promise<Policy>;
  createNegotiation(input: {
    listingId: string;
    buyerId: string;
    kind: 'sale' | 'rent';
    rentDays?: number;
  }): Promise<Negotiation>;
  getNegotiation(id: string): Promise<Negotiation | null>;
  updateNegotiation(
    id: string,
    patch: Partial<Pick<Negotiation, 'round' | 'lastCounterCents' | 'agreedCents' | 'status' | 'dealId'>>,
  ): Promise<Negotiation>;
  addMessage(msg: Omit<NegoMessage, 'id' | 'createdAt'>): Promise<NegoMessage>;
  listMessages(negotiationId: string): Promise<NegoMessage[]>;
}
