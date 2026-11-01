import "server-only";
import type { z } from "zod";
import { anthropicBackend } from "./anthropic";
import { mockBackend } from "./mock";
import { withSchemaRetry } from "./retry";
import type { CallOpts, LlmBackend, Msg, PhotoUrl } from "./types";

export { LlmSchemaError } from "./types";
export type { CallOpts, Msg } from "./types";

const backend = (): LlmBackend => (process.env.MOCK_LLM === "1" ? mockBackend : anthropicBackend);

export const llm = {
  /** Structured JSON from a conversation, validated against `schema` (one retry). */
  json<S extends z.ZodType>(schema: S, messages: Msg[], opts: CallOpts = {}): Promise<z.infer<S>> {
    return withSchemaRetry(schema, () => backend().json(schema, messages, opts));
  },

  /** Structured JSON from images plus a prompt, validated against `schema` (one retry). */
  vision<S extends z.ZodType>(schema: S, images: PhotoUrl[], prompt: string, opts: CallOpts = {}): Promise<z.infer<S>> {
    return withSchemaRetry(schema, () => backend().vision(schema, images, prompt, opts));
  },

  /** Free text, e.g. a one-line price explanation or a negotiation reply. */
  text(messages: Msg[], opts: CallOpts = {}): Promise<string> {
    return backend().text(messages, opts);
  },
};
