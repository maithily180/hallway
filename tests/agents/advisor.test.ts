import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Want } from "@/lib/contracts";
import { advise, adviseForMatches, daysFor } from "@/lib/agents/advisor";
import { findMatches, parseWant } from "@/lib/agents/matcher";
import { DEMO_LISTINGS } from "@/seed/demo";

beforeEach(() => vi.stubEnv("MOCK_LLM", "1"));
afterEach(() => vi.unstubAllEnvs());

describe("advise", () => {
  it("recommends renting for one night and shows the break-even", () => {
    const a = advise({ days: 1, newPriceCents: 30000, newPriceFound: false, rent: { perDayCents: 4000, depositCents: 15000 } });
    expect(a.pick).toBe("rent");
    expect(a.breakEvenDays).toBe(8);
    expect(a.summary).toBe("Rent it: $40 for 1 day versus $300 to buy. Buying only pays off if you need it for 8 days or more.");
    expect(a.options.find((o) => o.kind === "rent")).toMatchObject({ costCents: 4000, refundableCents: 15000 });
  });

  it("recommends buying when renting for the days costs more", () => {
    const a = advise({ days: 10, newPriceCents: 9000, newPriceFound: true, usedSaleCents: 3000, rent: { perDayCents: 500, depositCents: 4000 } });
    expect(a.pick).toBe("buy");
    expect(a.options[0]).toMatchObject({ kind: "buy", costCents: 3000 });
  });

  it("prefers a free loan", () => {
    const a = advise({ days: 2, newPriceCents: 9000, newPriceFound: false, borrow: { depositCents: 0 } });
    expect(a.pick).toBe("borrow");
    expect(a.summary).toMatch(/costs nothing/);
  });

  it("counts days from the want window", () => {
    const want = { parsed: { window: { start: "2026-11-05T18:00:00.000Z", end: "2026-11-07T10:00:00.000Z" } } } as Want;
    expect(daysFor(want)).toBe(2);
    expect(daysFor({ parsed: {} } as Want)).toBe(1);
  });
});

describe("adviseForMatches", () => {
  it("advises renting Maya's projector for Leo's request", async () => {
    const want = await parseWant("a projector tomorrow night under $35 with HDMI", "leo");
    const advice = await adviseForMatches(want, await findMatches(want, DEMO_LISTINGS));
    expect(advice?.pick).toBe("rent");
    expect(advice?.options.find((o) => o.kind === "rent")?.costCents).toBe(4000);
  });

  it("advises borrowing a drill", async () => {
    const want = await parseWant("borrow a drill this weekend", "leo");
    expect((await adviseForMatches(want, await findMatches(want, DEMO_LISTINGS)))?.pick).toBe("borrow");
  });
});
