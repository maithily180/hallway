import { describe, expect, it } from "vitest";
import type { Deal } from "@/lib/contracts";
import { earningsCents, rentalEvents } from "@/app/(app)/stuff/deals";

const deal = (over: Partial<Deal>): Deal => ({
  id: "d1",
  listingId: "hero-projector",
  buyerId: "leo",
  sellerId: "maya",
  type: "rent",
  amountCents: 3600,
  depositCents: 15000,
  start: "2026-11-06T18:00:00.000Z",
  end: "2026-11-07T18:00:00.000Z",
  state: "OUT",
  paypal: { captureIds: [] },
  timeline: [],
  ...over,
});

describe("My Stuff deals", () => {
  it("turns booked rentals into calendar events on the item's row", () => {
    const events = rentalEvents([deal({}), deal({ id: "d2", state: "AGREED" }), deal({ id: "d3", type: "sale" })], () => "Projector");
    expect(events).toEqual([
      { id: "d1", resourceId: "hero-projector", name: "Out · leo", startDate: new Date("2026-11-06T18:00:00.000Z"), endDate: new Date("2026-11-07T18:00:00.000Z") },
    ]);
  });

  it("adds up settled deals only", () => {
    expect(earningsCents([deal({ state: "SETTLED" }), deal({ state: "OUT" })])).toBe(3600);
  });
});
