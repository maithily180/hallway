import { randomUUID } from "node:crypto";
import { WantSchema, type Listing, type ListingMode, type Match, type Want } from "@/lib/contracts";
import { llm } from "@/lib/llm";
import { getListingStore, ownerReliability } from "./listings";
import { formatCents } from "./money";

type Parsed = Want["parsed"];

const SYSTEM = `You turn a student's request on a campus marketplace into structured fields.
"item" is one generic noun (projector, drill, bike). "intent" is buy, rent or borrow (default rent for short needs, buy for keeps).
"budgetCents" is the price limit in US cents if stated. "needs" are must-have extras (e.g. "HDMI"). "window" only if dates are clear.`;

const STOP = new Set(["a", "an", "the", "for", "to", "of", "and", "with", "i", "need", "want", "some", "my", "me", "under", "below", "max", "tomorrow", "tonight", "night", "today", "week", "weekend", "buy", "rent", "borrow", "lend"]);

const words = (s: string) => s.toLowerCase().match(/[a-z0-9]+/g) ?? [];

/** Code-only parse used in mock mode and when the model fails. */
export function parseWantText(text: string): Parsed {
  const t = text.toLowerCase();
  const budget = /\$\s?(\d+(?:\.\d{1,2})?)/.exec(t);
  const intent = /\b(buy|purchase|keep)\b/.test(t) ? "buy" : /\b(borrow|lend)\b/.test(t) ? "borrow" : "rent";
  const needs = [...t.matchAll(/\bwith (?:an? )?([a-z0-9]+)/g)].map((m) => m[1].toUpperCase() === "HDMI" ? "HDMI" : m[1]);
  const item = words(t).find((w) => !STOP.has(w) && !/^\d+$/.test(w) && !needs.map((n) => n.toLowerCase()).includes(w)) ?? "item";
  return {
    item,
    intent,
    budgetCents: budget ? Math.round(Number(budget[1]) * 100) : undefined,
    needs: /\bhdmi\b/.test(t) && !needs.includes("HDMI") ? [...needs, "HDMI"] : needs,
  };
}

/** Matcher step 1: plain words → Want. */
export async function parseWant(text: string, userId: string): Promise<Want> {
  let parsed = parseWantText(text);
  if (process.env.MOCK_LLM !== "1") {
    try {
      parsed = await llm.json(WantSchema.shape.parsed, [{ role: "user", content: text }], { name: "want", system: SYSTEM });
    } catch (err) {
      console.error("parseWant failed", err);
    }
  }
  return { id: randomUUID(), userId, text, parsed, status: "open" };
}

const MODE_FOR: Record<Parsed["intent"], ListingMode[]> = {
  buy: ["sell"],
  rent: ["rent", "lend"],
  borrow: ["lend", "rent"],
};

const CONDITION_SCORE: Record<Listing["conditionGrade"], number> = { new: 1, like_new: 0.9, good: 0.75, fair: 0.5, poor: 0.25 };

export const WEIGHTS = { relevance: 0.35, price: 0.25, availability: 0.15, condition: 0.1, reliability: 0.05, needs: 0.1 };

const haystack = (l: Listing) => `${l.title} ${l.category} ${l.description}`.toLowerCase();

/** True when the listing mentions the feature and does not negate it ("no HDMI adapter"). */
export function hasFeature(text: string, feature: string): boolean {
  const f = feature.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  if (!new RegExp(`\\b${f}\\b`).test(text)) return false;
  return !new RegExp(`\\b(no|without|missing|not)\\s+(\\w+\\s+)?${f}\\b`).test(text);
}

/** 1 when the item word appears in the category or title, partial for description-only hits. */
export function relevance(item: string, l: Listing): number {
  const w = item.toLowerCase().replace(/s$/, "");
  if (!w) return 0;
  if (l.category === w || words(l.title).some((t) => t.replace(/s$/, "") === w)) return 1;
  return words(l.description).some((t) => t.replace(/s$/, "") === w) ? 0.4 : 0;
}

function priceFor(l: Listing, mode: ListingMode): number {
  if (mode === "lend") return 0;
  return (mode === "sell" ? l.salePriceCents : l.rentPerDayCents) ?? 0;
}

/** 1 within budget, falling linearly to 0 at twice the budget. */
export function priceScore(priceCents: number, budgetCents?: number): number {
  if (!budgetCents) return 0.7;
  if (priceCents <= budgetCents) return 1;
  return Math.max(0, 1 - (priceCents - budgetCents) / budgetCents);
}

function reasonFor(l: Listing, mode: ListingMode, price: number, parsed: Parsed, needsMet: string[]): string {
  const parts: string[] = [];
  if (mode === "lend") parts.push("Free to borrow");
  else {
    const label = mode === "rent" ? `${formatCents(price)}/day` : formatCents(price);
    if (parsed.budgetCents && price > parsed.budgetCents) parts.push(`${label}, ${formatCents(price - parsed.budgetCents)} over your budget; the agent can negotiate`);
    else parts.push(parsed.budgetCents ? `${label}, within your budget` : label);
  }
  if (needsMet.length) parts.push(`has ${needsMet.join(", ")}`);
  parts.push(`${l.conditionGrade.replace("_", " ")} condition`);
  if (l.depositCents && mode === "rent") parts.push(`${formatCents(l.depositCents)} refundable deposit`);
  return parts.join(" · ");
}

/** Scores one listing for a want with the documented formula; undefined when it is not relevant. */
export function scoreListing(want: Want, l: Listing): Match | undefined {
  const rel = relevance(want.parsed.item, l);
  const mode = MODE_FOR[want.parsed.intent].find((m) => l.modes.includes(m));
  if (rel === 0 || !mode) return undefined;
  const price = priceFor(l, mode);
  const available = l.status === "active";
  const text = haystack(l);
  const needsMet = want.parsed.needs.filter((n) => hasFeature(text, n));
  const needs = want.parsed.needs.length ? needsMet.length / want.parsed.needs.length : 1;
  const score =
    WEIGHTS.relevance * rel +
    WEIGHTS.price * priceScore(price, want.parsed.budgetCents) +
    WEIGHTS.availability * (available ? 1 : 0) +
    WEIGHTS.condition * CONDITION_SCORE[l.conditionGrade] +
    WEIGHTS.reliability * ownerReliability(l.ownerId) +
    WEIGHTS.needs * needs;
  return {
    listingId: l.id,
    mode,
    priceCents: price,
    score: Math.round(score * 1000) / 1000,
    reason: reasonFor(l, mode, price, want.parsed, needsMet),
    available,
  };
}

/** Matcher step 2: top 3 listings for a want, best first, never the asker's own items. */
export async function findMatches(want: Want, listings?: Listing[]): Promise<Match[]> {
  const pool = listings ?? (await getListingStore().list());
  return pool
    .filter((l) => l.ownerId !== want.userId)
    .map((l) => scoreListing(want, l))
    .filter((m): m is Match => !!m)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
}
