import type { Deal } from "@/lib/contracts";

export type RentalEvent = { id: string; resourceId: string; name: string; startDate: Date; endDate: Date };

const BOOKED: Deal["state"][] = ["PAID", "HELD", "OUT", "RETURNED", "SETTLED", "CLAIMED"];

/** Rentals with dates become calendar events on their item's row. */
export function rentalEvents(deals: Deal[], titleFor: (listingId: string) => string | undefined): RentalEvent[] {
  return deals.flatMap((d) =>
    d.type !== "sale" && d.start && d.end && BOOKED.includes(d.state) && titleFor(d.listingId)
      ? [{ id: d.id, resourceId: d.listingId, name: `${d.state === "OUT" ? "Out" : "Booked"} · ${d.buyerId}`, startDate: new Date(d.start), endDate: new Date(d.end) }]
      : [],
  );
}

/** Money the owner has received: settled deals, minus nothing (deposits go back to renters). */
export function earningsCents(deals: Deal[]): number {
  return deals.filter((d) => d.state === "SETTLED").reduce((sum, d) => sum + d.amountCents, 0);
}
