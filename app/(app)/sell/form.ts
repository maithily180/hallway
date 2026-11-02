import type { ListingDraft, PriceSuggestion } from "@/lib/contracts";

export type Strategy = "sell_fast" | "best_price";

/** Parses a dollar amount typed by the seller ("28", "$28.50") into cents; NaN if invalid. */
export function dollarsToCents(input: string): number {
  const m = /^\s*\$?\s*(\d+)(?:\.(\d{1,2}))?\s*$/.exec(input);
  if (!m) return NaN;
  return Number(m[1]) * 100 + Number((m[2] ?? "0").padEnd(2, "0"));
}

/** Folds the seller's answers to missing-info questions into the description. */
export function applyAnswers(draft: ListingDraft, answers: Record<string, string>): ListingDraft {
  const answered = draft.missingInfo.filter((q) => answers[q]?.trim());
  const lines = answered.map((q) => `${q.replace(/\?$/, "")}: ${answers[q].trim()}.`);
  return {
    ...draft,
    description: [draft.description.trim(), ...lines].filter(Boolean).join("\n"),
    missingInfo: draft.missingInfo.filter((q) => !answered.includes(q)),
  };
}

export function listPriceFor(price: PriceSuggestion, strategy: Strategy): number {
  return strategy === "sell_fast" ? price.fastSaleCents : price.bestPriceCents;
}

/** Checks the floor the seller sets: a positive amount at or below the list price. */
export function floorError(listCents: number, floorCents: number): string | null {
  if (!Number.isFinite(floorCents) || floorCents <= 0) return "Enter the lowest price you'd accept.";
  if (floorCents > listCents) return "Your floor can't be above the list price.";
  return null;
}

/** Auto-accept point halfway between floor and list price, rounded to whole dollars. */
export function autoAcceptFor(listCents: number, floorCents: number): number {
  return Math.round((floorCents + listCents) / 2 / 100) * 100;
}
