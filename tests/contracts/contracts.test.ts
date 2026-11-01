import { describe, expect, it } from "vitest";
import { PolicySchema, PolicyViewSchema, CONTRACT_VERSION } from "@/lib/contracts";

const policy = {
  listingId: "l1",
  listPriceCents: 4000,
  floorCents: 2500,
  autoAcceptCents: 3400,
  mode: "full_auto",
  strategy: "best_price",
  maxRounds: 3,
  tone: "friendly",
  extrasAllowed: [],
} as const;

describe("contracts", () => {
  it("is version 1", () => expect(CONTRACT_VERSION).toBe(1));

  it("parses the hero policy", () => expect(PolicySchema.parse(policy).floorCents).toBe(2500));

  it("PolicyView rejects floor and auto-accept", () => {
    expect(PolicyViewSchema.safeParse(policy).success).toBe(false);
    const view = Object.fromEntries(
      Object.entries(policy).filter(([k]) => k !== "floorCents" && k !== "autoAcceptCents"),
    );
    expect(PolicyViewSchema.parse(view)).not.toHaveProperty("floorCents");
  });

  it("rejects fractional cents", () => {
    expect(PolicySchema.safeParse({ ...policy, listPriceCents: 40.5 }).success).toBe(false);
  });
});
