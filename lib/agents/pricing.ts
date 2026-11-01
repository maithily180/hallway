import type { Cents, ConditionGrade } from "@/lib/contracts";

export type Urgency = "low" | "high";

/** Share of the new price a like-new used item sells for, per category. */
export const DEPRECIATION: Record<string, number> = {
  projector: 0.55,
  laptop: 0.55,
  monitor: 0.5,
  speaker: 0.5,
  camera: 0.6,
  bike: 0.5,
  drill: 0.55,
  tools: 0.55,
  desk: 0.4,
  chair: 0.4,
  lamp: 0.4,
  furniture: 0.4,
  textbook: 0.35,
  kitchen: 0.4,
  other: 0.45,
};

/** Daily rent as a share of the new price, per category. */
export const RENT_RATE: Record<string, number> = {
  projector: 0.13,
  camera: 0.1,
  drill: 0.1,
  tools: 0.1,
  speaker: 0.1,
  bike: 0.08,
  other: 0.08,
};

export const CONDITION_FACTOR: Record<ConditionGrade, number> = {
  new: 1,
  like_new: 0.9,
  good: 0.8,
  fair: 0.6,
  poor: 0.35,
};

/** Typical new price when no product lookup is available (generic items, no brands). */
export const REFERENCE_NEW_PRICE_CENTS: Record<string, Cents> = {
  projector: 30000,
  laptop: 80000,
  monitor: 20000,
  speaker: 8000,
  camera: 50000,
  bike: 40000,
  drill: 9000,
  tools: 5000,
  desk: 15000,
  chair: 10000,
  lamp: 3000,
  furniture: 15000,
  textbook: 12000,
  kitchen: 4000,
  other: 5000,
};

const DEPOSIT_SHARE = 0.5;

const lookup = <T>(table: Record<string, T>, category: string): T => table[category.toLowerCase()] ?? table.other;

/** Rounds to $5 steps from $20 up, otherwise to whole dollars. */
export function roundPrice(cents: number): Cents {
  const step = cents >= 2000 ? 500 : 100;
  return Math.max(100, Math.round(cents / step) * step);
}

export function referenceNewPrice(category: string): Cents {
  return lookup(REFERENCE_NEW_PRICE_CENTS, category);
}

export interface PriceNumbers {
  newPriceCents: Cents;
  saleRangeCents: [Cents, Cents];
  fastSaleCents: Cents;
  bestPriceCents: Cents;
  rentPerDayCents: Cents;
  depositCents: Cents;
}

/** Every price is computed here from new price × depreciation × condition, then urgency. */
export function computePrices(input: {
  newPriceCents: Cents;
  category: string;
  conditionGrade: ConditionGrade;
  urgency: Urgency;
}): PriceNumbers {
  const { newPriceCents, category, conditionGrade, urgency } = input;
  const base = newPriceCents * lookup(DEPRECIATION, category) * CONDITION_FACTOR[conditionGrade];
  const [fastShare, bestShare] = urgency === "high" ? [0.85, 1] : [0.9, 1.1];
  const fastSaleCents = roundPrice(base * fastShare);
  const bestPriceCents = Math.max(fastSaleCents, roundPrice(base * bestShare));
  return {
    newPriceCents,
    saleRangeCents: [fastSaleCents, bestPriceCents],
    fastSaleCents,
    bestPriceCents,
    rentPerDayCents: roundPrice(newPriceCents * lookup(RENT_RATE, category)),
    depositCents: Math.max(1000, Math.round((newPriceCents * DEPOSIT_SHARE) / 1000) * 1000),
  };
}
