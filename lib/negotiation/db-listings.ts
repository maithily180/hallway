import type { Listing } from '@/lib/contracts';
import { ListingSchema } from '@/lib/contracts';
import type { ListingStore, NewListing } from '@/lib/agents/listings';

/**
 * Listings in Postgres, for when `DATABASE_URL` is set. Implements the app's `ListingStore`
 * so the sell, matches and negotiation code all see the same rows. The database is imported
 * lazily, so merely loading this file never opens a connection.
 */
export function createPrismaListingStore(): ListingStore {
  const db = async () => (await import('@/lib/db')).db;

  const toListing = (row: Record<string, unknown> & { createdAt: Date }): Listing =>
    ListingSchema.parse({
      ...row,
      createdAt: row.createdAt.toISOString(),
      salePriceCents: row.salePriceCents ?? undefined,
      rentPerDayCents: row.rentPerDayCents ?? undefined,
      depositCents: row.depositCents ?? undefined,
    });

  return {
    async list(communityId) {
      const rows = await (await db()).listing.findMany({
        where: communityId ? { communityId } : undefined,
        orderBy: { createdAt: 'desc' },
      });
      return rows.map(toListing);
    },
    async get(id) {
      const row = await (await db()).listing.findUnique({ where: { id } });
      return row ? toListing(row) : undefined;
    },
    async create(input: NewListing) {
      const row = await (await db()).listing.create({ data: input });
      return toListing(row);
    },
  };
}
