import type { z } from "zod";
import { LlmSchemaError } from "./types";

/** Runs `call`, validates with `schema`, retries once on invalid output, then throws LlmSchemaError. */
export async function withSchemaRetry<S extends z.ZodType>(
  schema: S,
  call: () => Promise<unknown>,
): Promise<z.infer<S>> {
  let issues: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    const result = schema.safeParse(await call());
    if (result.success) return result.data;
    issues = result.error.issues;
  }
  throw new LlmSchemaError("LLM output failed schema validation twice", issues);
}
