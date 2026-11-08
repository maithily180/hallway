import { getListingStore } from '@/lib/agents/listings';
import type { Cents } from '@/lib/contracts';

/** What negotiation and the deal engine need to know about a listing. */
export interface ListingRef {
  ownerId: string;
  depositCents: Cents;
  /** Where the seller is paid out (Plan B) or paid directly (Plan A). */
  sellerPayoutEmail?: string;
}

export type ListingLookup = (listingId: string) => Promise<ListingRef | null>;

/** Sandbox emails for the demo users; real users get theirs from the database. */
function demoPayoutEmail(userId: string): string | undefined {
  if (userId === 'maya') return process.env.SANDBOX_MAYA_EMAIL || undefined;
  if (userId === 'leo') return process.env.SANDBOX_LEO_EMAIL || undefined;
  return undefined;
}

/** Reads listings from the app's listing store (the in-memory demo store until Prisma lands). */
export const storeListingLookup: ListingLookup = async (listingId) => {
  const listing = await getListingStore().get(listingId);
  if (!listing) return null;
  return {
    ownerId: listing.ownerId,
    depositCents: listing.depositCents ?? 0,
    sellerPayoutEmail: demoPayoutEmail(listing.ownerId),
  };
};
