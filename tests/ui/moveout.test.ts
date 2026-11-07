import { describe, expect, it } from "vitest";
import type { ListingDraft } from "@/lib/contracts";
import { dedupeDrafts, frameTimes, moveOutFloor, type BulkItem } from "@/app/(app)/sell/moveout";

const item = (key: string, title: string, confidence: number, category = "lamp"): BulkItem => ({
  key,
  photo: `p-${key}`,
  draft: { title, category, conditionGrade: "good", defects: [], description: "", missingInfo: [], confidence } as ListingDraft,
});

describe("move-out mode", () => {
  it("spreads frames across the clip", () => {
    expect(frameTimes(20, 4)).toEqual([2.5, 7.5, 12.5, 17.5]);
    expect(frameTimes(3)).toHaveLength(3);
    expect(frameTimes(0)).toEqual([]);
    expect(frameTimes(NaN)).toEqual([]);
  });

  it("keeps the clearest draft of each item and drops unsure ones", () => {
    const out = dedupeDrafts([
      item("a", "Desk lamp", 0.6),
      item("b", "desk lamp ", 0.9),
      item("c", "Rice cooker", 0.8, "kitchen"),
      item("d", "Blurry thing", 0.1, "other"),
    ]);
    expect(out.map((i) => i.key)).toEqual(["b", "c"]);
  });

  it("sets the floor at 80% of the fast-sale price, whole dollars", () => {
    expect(moveOutFloor(2500)).toBe(2000);
    expect(moveOutFloor(1800)).toBe(1400);
  });
});
