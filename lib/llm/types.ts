import type { z } from "zod";
import type { Msg, PhotoUrl } from "@/lib/contracts";

export type { Msg, PhotoUrl };

export interface CallOpts {
  /** Fixture key used when MOCK_LLM=1, e.g. "listingDraft". */
  name?: string;
  system?: string;
  maxTokens?: number;
}

export class LlmSchemaError extends Error {
  constructor(
    message: string,
    readonly issues: unknown,
  ) {
    super(message);
    this.name = "LlmSchemaError";
  }
}

export interface LlmBackend {
  json(schema: z.ZodType, messages: Msg[], opts: CallOpts): Promise<unknown>;
  vision(schema: z.ZodType, images: PhotoUrl[], prompt: string, opts: CallOpts): Promise<unknown>;
  text(messages: Msg[], opts: CallOpts): Promise<string>;
}
