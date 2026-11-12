import { getListingStore } from '@/lib/agents/listings';
import { inspectCondition } from '@/lib/agents/inspector';
import { ListingSchema } from '@/lib/contracts';
import type { InspectFn } from './deals';

/** Loads the full listing for a deal, from the app's store or (with a database) the Listing table. */
async function loadListing(listingId: string) {
  const fromStore = await getListingStore().get(listingId);
  if (fromStore) return fromStore;
  if (!process.env.DATABASE_URL) return null;
  const { db } = await import('@/lib/db');
  const row = await db.listing.findUnique({ where: { id: listingId } });
  if (!row) return null;
  return ListingSchema.parse({
    ...row,
    createdAt: row.createdAt.toISOString(),
    salePriceCents: row.salePriceCents ?? undefined,
    rentPerDayCents: row.rentPerDayCents ?? undefined,
    depositCents: row.depositCents ?? undefined,
  });
}

/** The Inspector for returns: Chandrani's `inspectCondition`, which only proposes a deduction. */
export const inspectReturn: InspectFn = async ({ listingId, before, after }) => {
  const listing = await loadListing(listingId);
  if (!listing) throw new Error(`Listing ${listingId} not found for inspection`);
  return inspectCondition(before, after, listing);
};
