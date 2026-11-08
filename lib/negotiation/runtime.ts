import 'server-only';
import { getDealService } from '@/lib/engine/runtime';
import { storeListingLookup } from './listing-lookup';
import type { LlmApi } from './llm-api';
import { createMemoryStore } from './memory-store';
import { mockLlm } from './mock-llm';
import { createNegotiationService, type NegotiationService } from './service';
import type { NegotiationStore } from './store';

const globalForService = globalThis as unknown as { hallwayNegotiation?: NegotiationService };

async function getLlm(): Promise<LlmApi> {
  // MOCK_LLM=1 uses the scripted negotiator (it reads "$N" and always answers with the engine's
  // price), which is what the demo needs; otherwise the real model client.
  if (process.env.MOCK_LLM === '1') return mockLlm;
  return (await import('@/lib/llm')).llm;
}

async function getStore(): Promise<NegotiationStore> {
  // No database configured: in-memory store, reading listings from the app's listing store and
  // seeded with the hero projector's policy.
  if (!process.env.DATABASE_URL) return createMemoryStore({ seedHero: true, lookup: storeListingLookup });
  return (await import('./prisma-store')).prismaStore;
}

/** The negotiation service used by API routes; one instance per server process. */
export async function getNegotiationService(): Promise<NegotiationService> {
  if (!globalForService.hallwayNegotiation) {
    const deals = await getDealService();
    globalForService.hallwayNegotiation = createNegotiationService({
      store: await getStore(),
      llm: await getLlm(),
      // An agreed negotiation becomes a Deal; the buyer then pays at /deals/[id].
      onAgreed: async (n) => ({ dealId: (await deals.createFromNegotiation(n)).id }),
    });
  }
  return globalForService.hallwayNegotiation;
}
