import { randomUUID } from 'node:crypto';
import type { Deal } from '@/lib/contracts';
import type { DealStore, ListingTerms } from './store';

/** In-memory deal store for tests and no-database mock mode. */
export function createMemoryDealStore(
  listings: Record<string, ListingTerms> = {
    'listing-projector': {
      ownerId: 'maya',
      depositCents: 15000,
      sellerPayoutEmail: process.env.SANDBOX_MAYA_EMAIL ?? 'maya@example.test',
    },
  },
): DealStore {
  const deals = new Map<string, Deal>();
  const events = new Set<string>();

  return {
    async getListingTerms(listingId) {
      return listings[listingId] ?? null;
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
    async recordWebhookEvent(id) {
      if (events.has(id)) return false;
      events.add(id);
      return true;
    },
  };
}
