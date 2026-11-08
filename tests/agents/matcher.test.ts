import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMemoryListingStore } from "@/lib/agents/listings";
import { findMatches, hasFeature, parseWant, parseWantText, priceScore, relevance } from "@/lib/agents/matcher";
import { DEMO_LISTINGS } from "@/seed/demo";

beforeEach(() => vi.stubEnv("MOCK_LLM", "1"));
afterEach(() => vi.unstubAllEnvs());

const hero = DEMO_LISTINGS.find((l) => l.id === "hero-projector")!;

describe("parseWantText", () => {
  it("parses the hero request", () => {
    expect(parseWantText("a projector tomorrow night under $35 with HDMI")).toEqual({
      item: "projector",
      intent: "rent",
      budgetCents: 3500,
      needs: ["HDMI"],
    });
  });

  it("detects buy and borrow intents", () => {
    expect(parseWantText("Buy a desk lamp under $20")).toMatchObject({ intent: "buy", item: "desk", budgetCents: 2000 });
    expect(parseWantText("borrow a drill this weekend")).toMatchObject({ intent: "borrow", item: "drill" });
  });
});

describe("findMatches", () => {
  it("ranks Maya's projector first for Leo's request", async () => {
    const want = await parseWant("a projector tomorrow night under $35 with HDMI", "leo");
    const [top, ...rest] = await findMatches(want, DEMO_LISTINGS);
    expect(top).toMatchObject({ listingId: "hero-projector", mode: "rent", priceCents: 4000, available: true });
    expect(top.reason).toMatch(/\$5 over your budget/);
    expect(top.reason).toMatch(/HDMI/);
    expect(rest.every((m) => m.score <= top.score)).toBe(true);
  });

  it("never matches the asker's own items", async () => {
    const want = await parseWant("rent a projector", "maya");
    expect((await findMatches(want, DEMO_LISTINGS)).map((m) => m.listingId)).not.toContain("hero-projector");
  });

  it("prefers lend listings for borrow requests and returns at most 3", async () => {
    const drill = await findMatches(await parseWant("borrow a drill", "leo"), DEMO_LISTINGS);
    expect(drill[0]).toMatchObject({ listingId: "cordless-drill", mode: "lend", priceCents: 0 });
    expect((await findMatches(await parseWant("rent anything kitchen", "leo"), DEMO_LISTINGS)).length).toBeLessThanOrEqual(3);
  });

  it("returns nothing for items nobody has", async () => {
    expect(await findMatches(await parseWant("rent a kayak", "leo"), DEMO_LISTINGS)).toEqual([]);
  });

  it("skips listings that are not available", async () => {
    const want = await parseWant("rent a projector", "leo");
    const matches = await findMatches(want, [{ ...hero, status: "reserved" }]);
    expect(matches[0].available).toBe(false);
  });
});

describe("scoring parts", () => {
  it("treats negated features as missing", () => {
    expect(hasFeature("hdmi cable included", "HDMI")).toBe(true);
    expect(hasFeature("usb-c only, no hdmi adapter", "HDMI")).toBe(false);
    expect(hasFeature("comes without a remote", "remote")).toBe(false);
  });

  it("scores price against budget", () => {
    expect(priceScore(3000, 3500)).toBe(1);
    expect(priceScore(5250, 3500)).toBe(0.5);
    expect(priceScore(8000, 3500)).toBe(0);
  });

  it("scores relevance from category and title", () => {
    expect(relevance("projectors", hero)).toBe(1);
    expect(relevance("dorm", hero)).toBe(0.4);
    expect(relevance("kayak", hero)).toBe(0);
  });
});

describe("memory listing store", () => {
  it("creates and finds listings", async () => {
    const store = createMemoryListingStore([]);
    const { id, createdAt, ...input } = hero;
    void id;
    void createdAt;
    const made = await store.create(input);
    expect(await store.get(made.id)).toEqual(made);
    expect(await store.list("other")).toEqual([]);
  });
});
