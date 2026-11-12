import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WantSchema } from "@/lib/contracts";
import { pickBackend } from "@/lib/llm";
import { openAiCompatBackend } from "@/lib/llm/openai-compat";

describe("pickBackend", () => {
  it("prefers mock, then the free key, then Anthropic, else mock", () => {
    expect(pickBackend({ MOCK_LLM: "1", LLM_API_KEY: "k" })).toBe("mock");
    expect(pickBackend({ LLM_API_KEY: "k", ANTHROPIC_API_KEY: "a" })).toBe("openai");
    expect(pickBackend({ ANTHROPIC_API_KEY: "a" })).toBe("anthropic");
    expect(pickBackend({})).toBe("mock");
  });
});

describe("openAiCompatBackend", () => {
  beforeEach(() => vi.stubEnv("LLM_API_KEY", "test-key"));
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("sends the schema and parses fenced JSON", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ choices: [{ message: { content: '```json\n{"item":"projector"}\n```' } }] })),
    );
    vi.stubGlobal("fetch", fetchMock);
    const out = await openAiCompatBackend.json(WantSchema.shape.parsed, [{ role: "user", content: "a projector" }], {});
    expect(out).toEqual({ item: "projector" });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.messages[0].content).toContain("JSON Schema");
    expect(body.response_format).toEqual({ type: "json_object" });
  });

  it("throws when every model fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockImplementation(async () => new Response("quota", { status: 429 })));
    await expect(openAiCompatBackend.text([{ role: "user", content: "hi" }], {})).rejects.toThrow("429");
  });

  it("falls back to the next model when one is overloaded", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("busy", { status: 503 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ choices: [{ message: { content: "ok" } }] })));
    vi.stubGlobal("fetch", fetchMock);
    await expect(openAiCompatBackend.text([{ role: "user", content: "hi" }], {})).resolves.toBe("ok");
    expect(JSON.parse(fetchMock.mock.calls[1][1].body).model).toBe("gemini-3.5-flash-lite");
  });

  it("does not retry on auth errors", async () => {
    const fetchMock = vi.fn().mockImplementation(async () => new Response("bad key", { status: 401 }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(openAiCompatBackend.text([{ role: "user", content: "hi" }], {})).rejects.toThrow("401");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
