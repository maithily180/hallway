import type { Cents, Deal, DealType, InspectionResult, PhotoUrl } from '@/lib/contracts';

export interface InspectionRecord {
  dealId: string;
  beforePhotos: PhotoUrl[];
  afterPhotos: PhotoUrl[];
  result?: InspectionResult;
  ownerDecision?: 'ok' | 'dispute';
  renterDecision?: 'ok' | 'dispute';
}

export interface ListingTerms {
  ownerId: string;
  depositCents: Cents;
  /** Where the seller is paid (Plan B payouts, Plan A payee). */
  sellerPayoutEmail?: string;
}

export interface DealStore {
  getListingTerms(listingId: string): Promise<ListingTerms | null>;
  createDeal(deal: Omit<Deal, 'id'>): Promise<Deal>;
  getDeal(id: string): Promise<Deal | null>;
  saveDeal(deal: Deal): Promise<Deal>;
  listDeals(filter: { ownerId?: string; buyerId?: string; type?: DealType }): Promise<Deal[]>;
  findDealByPayPalId(ref: {
    orderId?: string;
    authorizationId?: string;
    captureId?: string;
    payoutBatchId?: string;
  }): Promise<Deal | null>;
  getInspection(dealId: string): Promise<InspectionRecord | null>;
  saveInspection(record: InspectionRecord): Promise<InspectionRecord>;
  /** Returns false if this PayPal event id was already processed. */
  recordWebhookEvent(id: string, type: string): Promise<boolean>;
}
