import { describe, expect, it } from "vitest";
import { createMemoryWantStore, demandFrom, demandTips, wantsForOwner } from "@/lib/agents/wants";
import { DEMO_LISTINGS, DEMO_WANTS } from "@/seed/demo";

describe("demand", () => {
  it("counts distinct people per item, most wanted first", () => {
    const demand = demandFrom(DEMO_WANTS);
    expect(demand[0]).toEqual({ item: "drill", count: 7 });
    expect(demand.find((d) => d.item === "kayak")?.count).toBe(2);
    expect(demand.find((d) => d.item === "mattress")?.count).toBe(1);
  });

  it("merges plurals and repeat askers", () => {
    const [w] = DEMO_WANTS;
    const twice = [w, { ...w, id: "x", parsed: { ...w.parsed, item: "Drills" } }];
    expect(demandFrom(twice)).toEqual([{ item: "drill", count: 1 }]);
  });

  it("tells Sam that 7 people looked for a drill", () => {
    const [tip] = demandTips(DEMO_LISTINGS, DEMO_WANTS, "sam");
    expect(tip.text).toBe("7 people looked for a drill; you're renting yours at $5/day.");
  });

  it("does not count the owner's own requests or other people's items", () => {
    expect(demandTips(DEMO_LISTINGS, DEMO_WANTS, "priya").some((t) => t.item === "drill")).toBe(false);
  });

  it("finds open wants an owner could fill", async () => {
    const store = createMemoryWantStore([]);
    await store.add({ ...DEMO_WANTS[9], status: "open" });
    expect(wantsForOwner(DEMO_LISTINGS, await store.list(), "sam")).toEqual([]);
    const tentWant = { ...DEMO_WANTS[9], id: "t", parsed: { ...DEMO_WANTS[9].parsed, item: "tent" } };
    expect(wantsForOwner(DEMO_LISTINGS, [tentWant], "sam").map((w) => w.id)).toEqual(["t"]);
  });
});
