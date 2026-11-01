import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { InspectionResult, Listing, ListingDraft } from "@/lib/contracts";
import { inspectCondition, enforceInspectionLimits } from "@/lib/agents/inspector";
import { draftListing, stripBrand } from "@/lib/agents/lister";
import { medianUsdCents } from "@/lib/agents/newprice";
import { suggestPrice } from "@/lib/agents/pricer";
import { computePrices, roundPrice } from "@/lib/agents/pricing";
import { llm } from "@/lib/llm";

vi.mock("server-only", () => ({}));

const draft: ListingDraft = {
  title: "Portable projector",
  category: "projector",
  conditionGrade: "good",
  defects: [],
  description: "",
  missingInfo: [],
  confidence: 0.9,
};

const listing: Listing = {
  id: "l1",
  ownerId: "maya",
  communityId: "c1",
  title: "Portable projector",
  category: "projector",
  description: "",
  conditionGrade: "good",
  defects: [],
  photos: [],
  modes: ["rent"],
  rentPerDayCents: 4000,
  depositCents: 15000,
  status: "active",
  createdAt: "2026-11-02T00:00:00Z",
};

beforeEach(() => vi.stubEnv("MOCK_LLM", "1"));
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("pricing", () => {
  it("prices the hero projector at about $40/day with a $150 deposit", () => {
    const n = computePrices({ newPriceCents: 30000, category: "projector", conditionGrade: "good", urgency: "low" });
    expect(n.rentPerDayCents).toBe(4000);
    expect(n.depositCents).toBe(15000);
    expect(n.fastSaleCents).toBeLessThanOrEqual(n.bestPriceCents);
  });

  it("prices lower when the seller is in a hurry or the item is worn", () => {
    const base = { newPriceCents: 30000, category: "projector", conditionGrade: "good" } as const;
    const low = computePrices({ ...base, urgency: "low" });
    expect(computePrices({ ...base, urgency: "high" }).bestPriceCents).toBeLessThan(low.bestPriceCents);
    expect(computePrices({ ...base, conditionGrade: "poor", urgency: "low" }).fastSaleCents).toBeLessThan(
      low.fastSaleCents,
    );
  });

  it("uses the default depreciation for unknown categories", () => {
    expect(() =>
      computePrices({ newPriceCents: 5000, category: "kayak", conditionGrade: "fair", urgency: "low" }),
    ).not.toThrow();
  });

  it("rounds to $5 from $20 up and to whole dollars below", () => {
    expect(roundPrice(13230)).toBe(13000);
    expect(roundPrice(1249)).toBe(1200);
    expect(roundPrice(10)).toBe(100);
  });

  it("takes the median USD offer from Channel3 results", () => {
    const offer = (price: number, currency = "USD") => ({ offers: [{ price: { price, currency } }] });
    expect(medianUsdCents({ products: [offer(280), offer(320), offer(300), offer(9, "EUR")] })).toBe(30000);
    expect(medianUsdCents({ products: [] })).toBeUndefined();
  });
});

describe("suggestPrice", () => {
  it("returns computed numbers and the explanation", async () => {
    const s = await suggestPrice(draft, { urgency: "low", communityId: "c1" });
    expect(s).toMatchObject({ rentPerDayCents: 4000, depositCents: 15000 });
    expect(s.newPriceCents).toBeUndefined();
    expect(s.explanation).toMatch(/\$40/);
  });

  it("falls back to a template explanation when the model fails", async () => {
    vi.spyOn(llm, "text").mockRejectedValue(new Error("down"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    const s = await suggestPrice(draft, { urgency: "high", communityId: "c1" });
    expect(s.explanation).toContain("$150 deposit");
  });

  it("never sends policy floors to the model", async () => {
    const text = vi.spyOn(llm, "text");
    await suggestPrice(draft, { urgency: "low", communityId: "c1" });
    expect(JSON.stringify(text.mock.calls)).not.toMatch(/floor|autoAccept/i);
  });
});

describe("draftListing", () => {
  it("returns a valid draft from the mock", async () => {
    const d = await draftListing(["https://x/p.jpg"], "projector for movie nights");
    expect(d.category).toBe("projector");
    expect(d.missingInfo.length).toBeGreaterThan(0);
  });

  it("returns the safe fallback when the model fails twice", async () => {
    vi.spyOn(llm, "vision").mockRejectedValue(new Error("bad output"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    const d = await draftListing(["https://x/p.jpg"], "my lamp");
    expect(d.missingInfo).toEqual(["Please describe the item"]);
    expect(d.description).toBe("my lamp");
  });

  it("asks for a description when there is nothing to go on", async () => {
    expect((await draftListing([], "  ")).missingInfo).toEqual(["Please describe the item"]);
  });

  it("removes the brand guess from title and description", () => {
    const d = stripBrand({ ...draft, title: "Acme Beam 300 projector", description: "An Acme Beam 300.", brandModelGuess: "Acme Beam 300" });
    expect(d.title).toBe("projector");
    expect(d.description).not.toContain("Acme");
  });
});

describe("inspectCondition", () => {
  const result: InspectionResult = {
    sameItem: true,
    newDamage: [{ description: "scratch", photoIndex: 0 }],
    missingParts: [],
    confidence: 0.9,
    proposedDeductionCents: 50000,
    summary: "",
  };

  it("caps the deduction at the deposit", () => {
    expect(enforceInspectionLimits(result, 15000).proposedDeductionCents).toBe(15000);
  });

  it("proposes no deduction when confidence is below 0.6", () => {
    expect(enforceInspectionLimits({ ...result, confidence: 0.59 }, 15000).proposedDeductionCents).toBe(0);
  });

  it("returns a clean result from the mock", async () => {
    const r = await inspectCondition(["b.jpg"], ["a.jpg"], listing);
    expect(r).toMatchObject({ sameItem: true, proposedDeductionCents: 0 });
  });

  it("falls back to no deduction when the model fails", async () => {
    vi.spyOn(llm, "vision").mockRejectedValue(new Error("down"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    const r = await inspectCondition(["b.jpg"], ["a.jpg"], listing);
    expect(r.proposedDeductionCents).toBe(0);
    expect(r.confidence).toBe(0);
  });
});
