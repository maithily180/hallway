import { describe, expect, it } from "vitest";
import type { ListingDraft, PriceSuggestion } from "@/lib/contracts";
import { applyAnswers, autoAcceptFor, dollarsToCents, floorError, listPriceFor } from "@/app/(app)/sell/form";

const draft: ListingDraft = {
  title: "Projector",
  category: "projector",
  conditionGrade: "good",
  defects: [],
  description: "Bright enough for a dorm room.",
  missingInfo: ["Does it include a remote?", "How old is it?"],
  confidence: 0.8,
};

describe("sell form", () => {
  it("parses dollar input into cents", () => {
    expect(dollarsToCents("25")).toBe(2500);
    expect(dollarsToCents("$28.5")).toBe(2850);
    expect(dollarsToCents(" $ 12.05 ")).toBe(1205);
    expect(dollarsToCents("twenty")).toBeNaN();
    expect(dollarsToCents("1.234")).toBeNaN();
  });

  it("folds answered questions into the description", () => {
    const out = applyAnswers(draft, { "Does it include a remote?": "yes", "How old is it?": " " });
    expect(out.description).toBe("Bright enough for a dorm room.\nDoes it include a remote: yes.");
    expect(out.missingInfo).toEqual(["How old is it?"]);
  });

  it("rejects a floor above the list price or empty", () => {
    expect(floorError(4000, 2500)).toBeNull();
    expect(floorError(4000, 4500)).toMatch(/above/);
    expect(floorError(4000, NaN)).toMatch(/lowest/);
    expect(floorError(4000, 0)).toMatch(/lowest/);
  });

  it("picks list price by strategy and puts auto-accept between floor and list", () => {
    const price = { fastSaleCents: 12000, bestPriceCents: 14500 } as PriceSuggestion;
    expect(listPriceFor(price, "sell_fast")).toBe(12000);
    expect(listPriceFor(price, "best_price")).toBe(14500);
    expect(autoAcceptFor(4000, 2500)).toBe(3300);
    expect(autoAcceptFor(4000, 2400)).toBe(3200);
  });
});
