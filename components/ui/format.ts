/** Formats integer USD cents for display, e.g. 2800 → "$28", 2850 → "$28.50". */
export function formatCents(cents: number): string {
  const dollars = cents / 100;
  return Number.isInteger(dollars) ? `$${dollars.toLocaleString("en-US")}` : `$${dollars.toFixed(2)}`;
}

export function cx(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(" ");
}
