import type { Cents } from "@/lib/contracts";

/** "$40" for whole dollars, "$12.50" otherwise. */
export function formatCents(cents: Cents): string {
  const dollars = cents / 100;
  return `$${Number.isInteger(dollars) ? dollars : dollars.toFixed(2)}`;
}
