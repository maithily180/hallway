import { afterEach, beforeEach, describe, expect, expectTypeOf, it, vi } from "vitest";
import { z } from "zod";
import {
  InspectionResultSchema,
  ListingDraftSchema,
  ParsedOfferSchema,
  WantSchema,
  type LlmApi,
} from "@/lib/contracts";
import { llm, LlmSchemaError } from "@/lib/llm";
import { withSchemaRetry } from "@/lib/llm/retry";

vi.mock("server-only", () => ({}));

it("satisfies the LlmApi contract", () => {
  expectTypeOf(llm).toExtend<LlmApi>();
});

describe("llm (MOCK_LLM=1)", () => {
  beforeEach(() => vi.stubEnv("MOCK_LLM", "1"));
  afterEach(() => vi.unstubAllEnvs());

  it("returns a valid ListingDraft from vision", async () => {
    const draft = await llm.vision(ListingDraftSchema, ["https://x/p.jpg"], "list it", { name: "listingDraft" });
    expect(draft.category).toBe("projector");
  });

  it("returns valid fixtures for every agent schema", async () => {
    await expect(llm.json(ParsedOfferSchema, [], { name: "parsedOffer" })).resolves.toMatchObject({ offerCents: 1500 });
    await expect(llm.vision(InspectionResultSchema, [], "", { name: "inspection" })).resolves.toMatchObject({
      sameItem: true,
    });
    await expect(llm.json(WantSchema.shape.parsed, [], { name: "want" })).resolves.toMatchObject({ intent: "rent" });
  });

  it("returns text fixtures", async () => {
    expect(await llm.text([], { name: "phrase" })).toContain("$36");
  });

  it("fails loudly when a fixture is missing", async () => {
    await expect(llm.json(z.object({}), [], { name: "nope" })).rejects.toThrow(/no JSON fixture/);
  });

  it("throws LlmSchemaError when a fixture does not match the schema", async () => {
    await expect(llm.json(z.object({ x: z.number() }), [], { name: "parsedOffer" })).rejects.toBeInstanceOf(
      LlmSchemaError,
    );
  });
});

describe("withSchemaRetry", () => {
  const schema = z.object({ n: z.number().int() });

  it("retries once and succeeds on the second try", async () => {
    const call = vi.fn().mockResolvedValueOnce({ n: "bad" }).mockResolvedValueOnce({ n: 2 });
    await expect(withSchemaRetry(schema, call)).resolves.toEqual({ n: 2 });
    expect(call).toHaveBeenCalledTimes(2);
  });

  it("gives up after two invalid outputs", async () => {
    const call = vi.fn().mockResolvedValue({ n: 1.5 });
    await expect(withSchemaRetry(schema, call)).rejects.toBeInstanceOf(LlmSchemaError);
    expect(call).toHaveBeenCalledTimes(2);
  });
});
