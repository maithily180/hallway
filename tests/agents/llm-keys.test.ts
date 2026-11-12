import { afterEach, describe, expect, it, vi } from "vitest";
import { apiKeys, openAiCompatBackend } from "@/lib/llm/openai-compat";

describe("api keys", () => {
  it("collects keys from every variable, trimmed and de-duplicated", () => {
    expect(apiKeys({ LLM_API_KEY: "a", LLM_API_KEYS: "b, c\nd,a", LLM_API_KEY_2: "e" })).toEqual(["a", "b", "c", "d", "e"]);
    expect(apiKeys({})).toEqual([]);
  });
});

describe("key rotation", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("moves to the next key when one is out of quota", async () => {
    vi.stubEnv("LLM_API_KEY", "dead");
    vi.stubEnv("LLM_API_KEYS", "live");
    const used: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_u: string, init: { headers: Record<string, string> }) => {
        const key = init.headers.authorization.replace("Bearer ", "");
        used.push(key);
        return key === "dead"
          ? new Response("quota", { status: 429 })
          : new Response(JSON.stringify({ choices: [{ message: { content: "hello" } }] }), { status: 200 });
      }),
    );
    expect(await openAiCompatBackend.text([{ role: "user", content: "hi" }], {})).toBe("hello");
    expect(used).toContain("live");
  });
});
