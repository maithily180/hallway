import { z } from "zod";
import type { CallOpts, LlmBackend, Msg, PhotoUrl } from "./types";

/** Any OpenAI-compatible chat endpoint; defaults to Gemini's free tier. */
const BASE_URL = () => (process.env.LLM_BASE_URL || "https://generativelanguage.googleapis.com/v1beta/openai").replace(/\/$/, "");
const MODEL = () => process.env.LLM_MODEL || "gemini-2.5-flash";
const DEFAULT_MAX_TOKENS = 8000;

type Part = { type: "text"; text: string } | { type: "image_url"; image_url: { url: string } };
type ChatMsg = { role: "system" | "user" | "assistant"; content: string | Part[] };

async function chat(messages: ChatMsg[], opts: CallOpts, jsonMode: boolean): Promise<string> {
  const res = await fetch(`${BASE_URL()}/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${process.env.LLM_API_KEY}` },
    body: JSON.stringify({
      model: MODEL(),
      max_tokens: opts.maxTokens ?? DEFAULT_MAX_TOKENS,
      messages,
      ...(jsonMode ? { response_format: { type: "json_object" } } : {}),
    }),
  });
  if (!res.ok) throw new Error(`LLM request failed: ${res.status} ${(await res.text()).slice(0, 300)}`);
  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  return data.choices?.[0]?.message?.content ?? "";
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
