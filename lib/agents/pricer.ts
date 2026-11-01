import { PriceSuggestionSchema, type ListingDraft, type PriceSuggestion } from "@/lib/contracts";
import { llm } from "@/lib/llm";
import { formatCents } from "./money";
import { lookupNewPrice } from "./newprice";
import { computePrices, referenceNewPrice, type PriceNumbers, type Urgency } from "./pricing";

const SYSTEM = `You explain a price suggestion to a student seller in one short, friendly sentence.
Use only the numbers given. Do not invent other numbers, brands or percentages.`;

/** Template used when the model is unavailable. */
export function fallbackExplanation(n: PriceNumbers, category: string): string {
  return `Similar ${category}s cost about ${formatCents(n.newPriceCents)} new; ${formatCents(n.rentPerDayCents)}/day with a ${formatCents(n.depositCents)} deposit, or sell for ${formatCents(n.fastSaleCents)} to ${formatCents(n.bestPriceCents)}.`;
}

async function explain(n: PriceNumbers, draft: ListingDraft, urgency: Urgency): Promise<string> {
  const facts = [
    `Item: ${draft.category}, condition ${draft.conditionGrade.replace("_", " ")}`,
    `New price: ${formatCents(n.newPriceCents)}`,
    `Fast-sale price: ${formatCents(n.fastSaleCents)}`,
    `Best price: ${formatCents(n.bestPriceCents)}`,
    `Rent per day: ${formatCents(n.rentPerDayCents)}`,
    `Deposit: ${formatCents(n.depositCents)}`,
    `Seller wants to sell ${urgency === "high" ? "quickly" : "for the best price"}`,
  ].join("\n");
  try {
    const text = await llm.text([{ role: "user", content: facts }], {
      name: "priceExplanation",
      system: SYSTEM,
      maxTokens: 200,
    });
    return text.trim() || fallbackExplanation(n, draft.category);
  } catch (err) {
    console.error("price explanation failed", err);
    return fallbackExplanation(n, draft.category);
  }
}

/** Pricer: numbers computed in code; the LLM only writes the one-line explanation. */
export async function suggestPrice(
  draft: ListingDraft,
  opts: { urgency: Urgency; communityId: string },
): Promise<PriceSuggestion> {
  const found = await lookupNewPrice(`new ${draft.category} ${draft.title}`);
  const numbers = computePrices({
    newPriceCents: found ?? referenceNewPrice(draft.category),
    category: draft.category,
    conditionGrade: draft.conditionGrade,
    urgency: opts.urgency,
  });
  return PriceSuggestionSchema.parse({
    ...numbers,
    newPriceCents: found,
    explanation: await explain(numbers, draft, opts.urgency),
  });
}
