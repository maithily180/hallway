import { randomUUID } from 'node:crypto';
import type { Deal } from '@/lib/contracts';
import type { ListingLookup } from '@/lib/negotiation/listing-lookup';
import type { DealStore, InspectionRecord, ListingTerms } from './store';

/** In-memory deal store for tests and no-database mock mode. */
export function createMemoryDealStore(
  listings: Record<string, ListingTerms> = {
    'hero-projector': {
      ownerId: 'maya',
      depositCents: 15000,
      sellerPayoutEmail: process.env.SANDBOX_MAYA_EMAIL || 'maya@example.test',
    },
  },
  lookup?: ListingLookup,
): DealStore {
  const deals = new Map<string, Deal>();
  const events = new Set<string>();
  const inspections = new Map<string, InspectionRecord>();

  return {
    async getListingTerms(listingId) {
      return (await lookup?.(listingId)) ?? listings[listingId] ?? null;
    },
    async createDeal(deal) {
      const created = { ...deal, id: randomUUID() };
      deals.set(created.id, created);
      return created;
    },
    async getDeal(id) {
      return deals.get(id) ?? null;
    },
    async saveDeal(deal) {
      deals.set(deal.id, deal);
      return deal;
    },
    async listDeals({ ownerId, buyerId, type }) {
      return [...deals.values()].filter(
        (d) =>
          (!ownerId || d.sellerId === ownerId) &&
          (!buyerId || d.buyerId === buyerId) &&
          (!type || d.type === type),
      );
    },
    async findDealByPayPalId({ orderId, authorizationId, captureId, payoutBatchId }) {
      return (
        [...deals.values()].find(
          (d) =>
            (orderId && d.paypal.orderId === orderId) ||
            (authorizationId && d.paypal.authorizationId === authorizationId) ||
            (captureId && d.paypal.captureIds.includes(captureId)) ||
            (payoutBatchId && d.paypal.payoutBatchId === payoutBatchId),
        ) ?? null
      );
    },
    async getInspection(dealId) {
      return inspections.get(dealId) ?? null;
    },
    async saveInspection(record) {
      inspections.set(record.dealId, record);
      return record;
    },
    async recordWebhookEvent(id) {
      if (events.has(id)) return false;
      events.add(id);
      return true;
    },
  };
}
