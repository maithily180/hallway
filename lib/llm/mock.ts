import { fixtures, textFixtures } from "./fixtures";
import type { CallOpts, LlmBackend } from "./types";

function jsonFixture(opts: CallOpts): unknown {
  if (!opts.name || !(opts.name in fixtures)) {
    throw new Error(`MOCK_LLM: no JSON fixture for "${opts.name}". Add one to lib/llm/fixtures.`);
  }
  return structuredClone(fixtures[opts.name as keyof typeof fixtures]);
}

export const mockBackend: LlmBackend = {
  json: async (_schema, _messages, opts) => jsonFixture(opts),
  vision: async (_schema, _images, _prompt, opts) => jsonFixture(opts),
  text: async (_messages, opts) => textFixtures[opts.name ?? ""] ?? "Sounds good.",
};
