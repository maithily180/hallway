import 'server-only';
import { storeListingLookup } from '@/lib/negotiation/listing-lookup';
import { getPayPal } from '@/lib/paypal';
import { createDealService, type DealService } from './deals';
import { inspectReturn } from './inspect';
import { createMemoryDealStore } from './memory-store';
import type { DealStore } from './store';

const g = globalThis as unknown as { hallwayDealStore?: DealStore; hallwayDeals?: DealService };

export async function getDealStore(): Promise<DealStore> {
  if (!g.hallwayDealStore) {
    // No database configured: in-memory store reading listings from the app's listing store.
    g.hallwayDealStore = process.env.DATABASE_URL
      ? (await import('./prisma-store')).prismaDealStore
      : createMemoryDealStore({}, storeListingLookup);
  }
  return g.hallwayDealStore;
}

/** The deal service used by API routes and the negotiation hook; one per server process. */
export async function getDealService(): Promise<DealService> {
  if (!g.hallwayDeals) {
    g.hallwayDeals = createDealService({
      store: await getDealStore(),
      paypal: await getPayPal(),
      inspect: inspectReturn,
    });
  }
  return g.hallwayDeals;
}
