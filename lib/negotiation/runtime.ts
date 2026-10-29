import 'server-only';
import type { LlmApi } from '@/lib/contracts';
import { createMemoryStore } from './memory-store';
import { mockLlm } from './mock-llm';
import { createNegotiationService, type NegotiationService } from './service';
import type { NegotiationStore } from './store';

const globalForService = globalThis as unknown as { hallwayNegotiation?: NegotiationService };

async function getLlm(): Promise<LlmApi> {
  if (process.env.MOCK_LLM === '1') return mockLlm;
  // TODO: switch to `import { llm } from '@/lib/llm'` once Chandrani's module lands
  // (see NOTES/requests.md).
  throw new Error('lib/llm is not available yet; run with MOCK_LLM=1');
}

async function getStore(): Promise<NegotiationStore> {
  // No database configured: run against the in-memory store seeded with the hero projector.
  if (!process.env.DATABASE_URL) return createMemoryStore();
  return (await import('./prisma-store')).prismaStore;
}

/** The negotiation service used by API routes; one instance per server process. */
export async function getNegotiationService(): Promise<NegotiationService> {
  if (!globalForService.hallwayNegotiation) {
    globalForService.hallwayNegotiation = createNegotiationService({
      store: await getStore(),
      llm: await getLlm(),
    });
  }
  return globalForService.hallwayNegotiation;
}
