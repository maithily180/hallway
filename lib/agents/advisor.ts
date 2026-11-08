import type { Cents, Match, Want } from "@/lib/contracts";
import { getListingStore } from "./listings";
import { formatCents } from "./money";
import { lookupNewPrice } from "./newprice";
import { referenceNewPrice } from "./pricing";

export type AdviceKind = "buy" | "rent" | "borrow";

export type AdviceOption = { kind: AdviceKind; costCents: Cents; refundableCents: Cents; detail: string };

export type Advice = {
  pick: AdviceKind;
  days: number;
  options: AdviceOption[];
  breakEvenDays?: number;
  summary: string;
};

export type AdviceInput = {
  days: number;
  newPriceCents: Cents;
  /** True when the new price came from a product lookup, false when it is a category estimate. */
  newPriceFound: boolean;
  usedSaleCents?: Cents;
  rent?: { perDayCents: Cents; depositCents: Cents };
  borrow?: { depositCents: Cents };
};

const DAY_MS = 86_400_000;

/** Rental length in whole days from the want's window, at least 1. */
export function daysFor(want: Want): number {
  const w = want.parsed.window;
  if (!w) return 1;
  return Math.max(1, Math.ceil((Date.parse(w.end) - Date.parse(w.start)) / DAY_MS));
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

/** Buy vs rent vs borrow, all math in code: borrowing free wins, else the cheaper of renting for the days and buying. */
export function advise(input: AdviceInput): Advice {
  const { days, rent, borrow } = input;
  const buyCents = input.usedSaleCents ?? input.newPriceCents;
  const buyDetail =
    input.usedSaleCents !== undefined
      ? `${formatCents(input.usedSaleCents)} used on campus (about ${formatCents(input.newPriceCents)} new)`
      : `about ${formatCents(input.newPriceCents)} new${input.newPriceFound ? "" : " (typical price)"}`;
  const options: AdviceOption[] = [{ kind: "buy", costCents: buyCents, refundableCents: 0, detail: buyDetail }];

  let breakEvenDays: number | undefined;
  if (rent && rent.perDayCents > 0) {
    breakEvenDays = Math.ceil(buyCents / rent.perDayCents);
    options.push({
      kind: "rent",
      costCents: rent.perDayCents * days,
      refundableCents: rent.depositCents,
      detail: `${formatCents(rent.perDayCents)}/day × ${plural(days, "day")}${rent.depositCents ? `, plus a ${formatCents(rent.depositCents)} deposit you get back` : ""}`,
    });
  }
  if (borrow) {
    options.push({
      kind: "borrow",
      costCents: 0,
      refundableCents: borrow.depositCents,
      detail: `free from a neighbour${borrow.depositCents ? `, ${formatCents(borrow.depositCents)} deposit you get back` : ""}`,
    });
  }

  const pick: AdviceKind = borrow ? "borrow" : rent && rent.perDayCents * days < buyCents ? "rent" : "buy";
  const rentOpt = options.find((o) => o.kind === "rent");
  const summary =
    pick === "borrow"
      ? `Borrow it: it costs nothing, versus ${formatCents(buyCents)} to buy${rentOpt ? ` or ${formatCents(rentOpt.costCents)} to rent` : ""}.`
      : pick === "rent"
        ? `Rent it: ${formatCents(rentOpt!.costCents)} for ${plural(days, "day")} versus ${formatCents(buyCents)} to buy. Buying only pays off if you need it for ${plural(breakEvenDays!, "day")} or more.`
        : rentOpt
          ? `Buy it: renting for ${plural(days, "day")} would cost ${formatCents(rentOpt.costCents)}, more than ${formatCents(buyCents)} to buy.`
          : `Buy it: nobody nearby rents or lends one, and it costs ${formatCents(buyCents)}.`;

  return { pick, days, options, breakEvenDays, summary };
}

/** Builds advisor input from the ranked matches: the best-ranked rent, used sale and free loan. */
export function adviceInputFromMatches(
  matches: Match[],
  depositFor: (listingId: string) => Cents,
  days: number,
  newPrice: { cents: Cents; found: boolean },
): AdviceInput {
  const best = (mode: Match["mode"]) => matches.find((m) => m.mode === mode && m.available);
  const rent = best("rent");
  const sale = best("sell");
  const lend = best("lend");
  return {
    days,
    newPriceCents: newPrice.cents,
    newPriceFound: newPrice.found,
    usedSaleCents: sale?.priceCents,
    rent: rent && { perDayCents: rent.priceCents, depositCents: depositFor(rent.listingId) },
    borrow: lend && { depositCents: depositFor(lend.listingId) },
  };
}

/** Advice for a want and its matches; the new price comes from Channel3 when available, else the category estimate. */
export async function adviseForMatches(want: Want, matches: Match[]): Promise<Advice | undefined> {
  if (matches.length === 0) return undefined;
  const store = getListingStore();
  const listings = new Map(
    (await Promise.all(matches.map((m) => store.get(m.listingId)))).filter(Boolean).map((l) => [l!.id, l!]),
  );
  const category = listings.get(matches[0].listingId)?.category ?? want.parsed.item;
  const found = await lookupNewPrice(`new ${want.parsed.item}`);
  return advise(
    adviceInputFromMatches(matches, (id) => listings.get(id)?.depositCents ?? 0, daysFor(want), {
      cents: found ?? referenceNewPrice(category),
      found: found !== undefined,
    }),
  );
}
