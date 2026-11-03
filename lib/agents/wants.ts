import type { Listing, Want } from "@/lib/contracts";
import { DEMO_WANTS } from "@/seed/demo";
import { DEFAULT_COMMUNITY_ID } from "./listings";
import { relevance } from "./matcher";
import { computePrices, referenceNewPrice } from "./pricing";
import { formatCents } from "./money";

export type StoredWant = Want & { communityId: string; createdAt: string };

export interface WantStore {
  list(communityId?: string): Promise<StoredWant[]>;
  add(want: StoredWant): Promise<void>;
}

/** In-memory wants seeded with demo demand; replaced by the Prisma store once the schema is on main. */
export function createMemoryWantStore(seed: StoredWant[] = DEMO_WANTS): WantStore {
  const rows = seed.map((w) => structuredClone(w));
  return {
    async list(communityId) {
      return rows.filter((w) => !communityId || w.communityId === communityId);
    },
    async add(want) {
      rows.push(want);
    },
  };
}

const g = globalThis as unknown as { hallwayWants?: WantStore };

export function getWantStore(): WantStore {
  return (g.hallwayWants ??= createMemoryWantStore());
}

/** Saves a parsed want so it counts toward demand; open when nothing matched. */
export async function recordWant(want: Want, matched: boolean, communityId = DEFAULT_COMMUNITY_ID): Promise<void> {
  await getWantStore().add({ ...want, status: matched ? "matched" : "open", communityId, createdAt: new Date().toISOString() });
}

export type Demand = { item: string; count: number };

/** How many distinct people asked for each item, most wanted first. */
export function demandFrom(wants: StoredWant[]): Demand[] {
  const people = new Map<string, Set<string>>();
  for (const w of wants) {
    const item = w.parsed.item.toLowerCase().replace(/(?<!s)s$/, "");
    people.set(item, (people.get(item) ?? new Set()).add(w.userId));
  }
  return [...people.entries()]
    .map(([item, users]) => ({ item, count: users.size }))
    .sort((a, b) => b.count - a.count || a.item.localeCompare(b.item));
}

export async function getDemand(communityId = DEFAULT_COMMUNITY_ID): Promise<Demand[]> {
  return demandFrom(await getWantStore().list(communityId));
}

export type DemandTip = { listingId: string; item: string; count: number; text: string };

/** Demand scout: for each of an owner's items, how many others looked for it and what renting would earn. */
export function demandTips(listings: Listing[], wants: StoredWant[], ownerId: string): DemandTip[] {
  return listings
    .filter((l) => l.ownerId === ownerId)
    .flatMap((l) => {
      const askers = new Set(wants.filter((w) => w.userId !== ownerId && relevance(w.parsed.item, l) >= 1).map((w) => w.userId));
      if (askers.size === 0) return [];
      const perDay =
        l.rentPerDayCents ??
        computePrices({
          newPriceCents: referenceNewPrice(l.category),
          category: l.category,
          conditionGrade: l.conditionGrade,
          urgency: "low",
        }).rentPerDayCents;
      const who = askers.size === 1 ? "1 person looked" : `${askers.size} people looked`;
      const action = l.modes.includes("rent") ? "you're renting yours at" : "rent yours at";
      return [{ listingId: l.id, item: l.category, count: askers.size, text: `${who} for a ${l.category}; ${action} ${formatCents(perDay)}/day.` }];
    })
    .sort((a, b) => b.count - a.count);
}

/** Open wants an owner's items could fill (in-app notification until email exists). */
export function wantsForOwner(listings: Listing[], wants: StoredWant[], ownerId: string): StoredWant[] {
  const mine = listings.filter((l) => l.ownerId === ownerId);
  return wants.filter((w) => w.userId !== ownerId && w.status === "open" && mine.some((l) => relevance(w.parsed.item, l) >= 1));
}
