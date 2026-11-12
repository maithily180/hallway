import { z } from "zod";
import type { CallOpts, LlmBackend, Msg, PhotoUrl } from "./types";

/** Any OpenAI-compatible chat endpoint; defaults to Gemini's free tier. */
const BASE_URL = () => (process.env.LLM_BASE_URL || "https://generativelanguage.googleapis.com/v1beta/openai").replace(/\/$/, "");
const FALLBACK_MODELS = ["gemini-3.5-flash", "gemini-3.5-flash-lite"];
const MODELS = () => [...new Set([process.env.LLM_MODEL, ...FALLBACK_MODELS].filter((m): m is string => !!m))];
const TIMEOUT_MS = 20_000;
/** Keys: LLM_API_KEY plus LLM_API_KEYS (comma or newline separated) plus LLM_API_KEY_2..LLM_API_KEY_20. */
export function apiKeys(env: Record<string, string | undefined> = process.env): string[] {
  const extra = Array.from({ length: 19 }, (_, i) => env[`LLM_API_KEY_${i + 2}`]);
  const all = [env.LLM_API_KEY, ...(env.LLM_API_KEYS ?? "").split(/[,\s]+/), ...extra];
  return [...new Set(all.map((k) => k?.trim()).filter((k): k is string => !!k))];
}
/** A key that just ran out of quota or was rejected is skipped for a while, so later calls stay fast. */
const COOLDOWN_MS = 60_000;
const cooling = new Map<string, number>();
let rotation = 0;
const KEY_PROBLEM = new Set([400, 401, 403, 429]);
/** Overloaded, rate-limited, retired or timed out: worth trying the next model. */
const RETRYABLE = new Set([404, 408, 429, 500, 502, 503, 504]);
const DEFAULT_MAX_TOKENS = 8000;
/** Hidden reasoning counts against the limit, so a small cap cuts replies off mid-sentence. */
const MIN_MAX_TOKENS = 1024;

type Part = { type: "text"; text: string } | { type: "image_url"; image_url: { url: string } };
type ChatMsg = { role: "system" | "user" | "assistant"; content: string | Part[] };

async function chatOnce(key: string, model: string, messages: ChatMsg[], opts: CallOpts, jsonMode: boolean): Promise<Response> {
  return fetch(`${BASE_URL()}/chat/completions`, {
    method: "POST",
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model,
      max_tokens: Math.max(opts.maxTokens ?? DEFAULT_MAX_TOKENS, MIN_MAX_TOKENS),
      reasoning_effort: process.env.LLM_REASONING_EFFORT || "low",
      messages,
      ...(jsonMode ? { response_format: { type: "json_object" } } : {}),
    }),
  });
}

async function chat(messages: ChatMsg[], opts: CallOpts, jsonMode: boolean): Promise<string> {
  const keys = apiKeys();
  if (!keys.length) throw new Error("LLM request failed: no API key configured");
  const now = Date.now();
  // spread load across keys, and try keys that are not cooling down first
  const start = rotation++ % keys.length;
  const ordered = [...keys.slice(start), ...keys.slice(0, start)];
  const fresh = ordered.filter((k) => (cooling.get(k) ?? 0) <= now);
  const tryOrder = [...fresh, ...ordered.filter((k) => !fresh.includes(k))];
  let lastError = "no model configured";
  for (const key of tryOrder) {
    for (const model of MODELS()) {
      let res: Response;
      try {
        res = await chatOnce(key, model, messages, opts, jsonMode);
      } catch (err) {
        lastError = `${model}: ${(err as Error).message}`;
        continue;
      }
      if (res.ok) {
        const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
        return data.choices?.[0]?.message?.content ?? "";
      }
      lastError = `${model}: ${res.status} ${(await res.text()).slice(0, 300)}`;
      if (KEY_PROBLEM.has(res.status)) {
        cooling.set(key, Date.now() + COOLDOWN_MS);
        break; // this key is out of quota or rejected: go to the next key
      }
      if (!RETRYABLE.has(res.status)) break;
    }
  }
  throw new Error(`LLM request failed: ${lastError}`);
}

function schemaSystem(schema: z.ZodType, system?: string): string {
  const shape = JSON.stringify(z.toJSONSchema(schema, { unrepresentable: "any" }));
  return `${system ? `${system}\n\n` : ""}Reply with one JSON object only, no prose, matching this JSON Schema:\n${shape}`;
}

function parseJson(raw: string): unknown {
  const s = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/```$/, "");
  try {
    return JSON.parse(s);
  } catch {
    return undefined;
  }
}

const toChat = (messages: Msg[]): ChatMsg[] => messages.map((m) => ({ role: m.role, content: m.content }));

export const openAiCompatBackend: LlmBackend = {
  async json(schema, messages, opts) {
    const raw = await chat([{ role: "system", content: schemaSystem(schema, opts.system) }, ...toChat(messages)], opts, true);
    return parseJson(raw);
  },

  async vision(schema, images: PhotoUrl[], prompt, opts) {
    const parts: Part[] = [...images.map((url) => ({ type: "image_url" as const, image_url: { url } })), { type: "text", text: prompt }];
    const raw = await chat([{ role: "system", content: schemaSystem(schema, opts.system) }, { role: "user", content: parts }], opts, true);
    return parseJson(raw);
  },

  async text(messages, opts) {
    const sys: ChatMsg[] = opts.system ? [{ role: "system", content: opts.system }] : [];
    return chat([...sys, ...toChat(messages)], opts, false);
  },
};
