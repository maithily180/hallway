import type { z } from 'zod';
import type { Msg, PhotoUrl } from '@/lib/contracts';

/**
 * The slice of `lib/llm` the negotiation code uses. Defined here so tests and the scripted
 * mock can stand in for the real client, which satisfies it structurally.
 */
export interface LlmApi {
  json<S extends z.ZodType>(
    schema: S,
    messages: Msg[],
    opts?: { system?: string; maxTokens?: number; name?: string },
  ): Promise<z.infer<S>>;
  vision<S extends z.ZodType>(
    schema: S,
    images: PhotoUrl[],
    prompt: string,
    opts?: { system?: string; maxTokens?: number; name?: string },
  ): Promise<z.infer<S>>;
  text(messages: Msg[], opts?: { system?: string; maxTokens?: number; name?: string }): Promise<string>;
}
