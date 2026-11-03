import { randomUUID } from "node:crypto";
import type { Listing } from "@/lib/contracts";
import { DEMO_COMMUNITY, DEMO_LISTINGS, DEMO_USERS } from "@/seed/demo";

export type NewListing = Omit<Listing, "id" | "createdAt">;

export interface ListingStore {
  list(communityId?: string): Promise<Listing[]>;
  get(id: string): Promise<Listing | undefined>;
  create(input: NewListing): Promise<Listing>;
}

/** In-memory store seeded with the demo community; replaced by the Prisma store once the schema is on main. */
export function createMemoryListingStore(seed: Listing[] = DEMO_LISTINGS): ListingStore {
  const rows = new Map(seed.map((l) => [l.id, structuredClone(l)]));
  return {
    async list(communityId) {
      return [...rows.values()].filter((l) => !communityId || l.communityId === communityId);
    },
    async get(id) {
      return rows.get(id);
    },
    async create(input) {
      const listing: Listing = { ...input, id: randomUUID(), createdAt: new Date().toISOString() };
      rows.set(listing.id, listing);
      return listing;
    },
  };
}

const g = globalThis as unknown as { hallwayListings?: ListingStore };

export function getListingStore(): ListingStore {
  return (g.hallwayListings ??= createMemoryListingStore());
}

export const DEFAULT_COMMUNITY_ID = DEMO_COMMUNITY.id;

/** Owner reliability 0..1 from past deals; demo values until reputation lives in the DB. */
export function ownerReliability(ownerId: string): number {
  return DEMO_USERS.find((u) => u.id === ownerId)?.reliability ?? 0.75;
}

export function ownerName(ownerId: string): string {
  return DEMO_USERS.find((u) => u.id === ownerId)?.name ?? ownerId;
}
