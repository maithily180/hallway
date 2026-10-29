import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { z } from "zod";
import type { CallOpts, LlmBackend, Msg, PhotoUrl } from "./types";

const MODEL = "claude-opus-5-5";
const DEFAULT_MAX_TOKENS = 16000;

let client: Anthropic | undefined;
const getClient = () => (client ??= new Anthropic());

type ImageMediaType = "image/png" | "image/jpeg" | "image/gif" | "image/webp";

function imageBlock(url: PhotoUrl): Anthropic.ImageBlockParam {
  const m = /^data:(image\/(?:png|jpeg|gif|webp));base64,(.+)$/.exec(url);
  if (m) return { type: "image", source: { type: "base64", media_type: m[1] as ImageMediaType, data: m[2] } };
  return { type: "image", source: { type: "url", url } };
}

function assertNotRefused(stopReason: string | null): void {
  if (stopReason === "refusal") throw new Error("LLM refused the request");
}

async function structured(schema: z.ZodType, messages: Anthropic.MessageParam[], opts: CallOpts): Promise<unknown> {
  const res = await getClient().messages.parse({
    model: MODEL,
    max_tokens: opts.maxTokens ?? DEFAULT_MAX_TOKENS,
    system: opts.system,
    output_config: { format: zodOutputFormat(schema) },
    messages,
  });
  assertNotRefused(res.stop_reason);
  return res.parsed_output;
}

export const anthropicBackend: LlmBackend = {
  json: (schema, messages, opts) => structured(schema, messages, opts),

  vision: (schema, images, prompt, opts) =>
    structured(schema, [{ role: "user", content: [...images.map(imageBlock), { type: "text", text: prompt }] }], opts),

  async text(messages: Msg[], opts) {
    const res = await getClient().messages.create({
      model: MODEL,
      max_tokens: opts.maxTokens ?? DEFAULT_MAX_TOKENS,
      system: opts.system,
      messages,
    });
    assertNotRefused(res.stop_reason);
    return res.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");
  },
};
