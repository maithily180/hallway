import type { LlmApi } from '@/lib/negotiation/llm-api';
import type { Decision } from './decide';
import { templateReply } from './phrase';

/**
 * Minimal scripted LLM so negotiation runs with MOCK_LLM=1 and no keys.
 * It parses "$N" from the buyer text and phrases the engine's price with the template.
 */
export const mockLlm: LlmApi = {
  async json(schema, messages) {
    const text = messages[messages.length - 1]?.content ?? '';
    const amount = text.match(/\$\s?(\d+(?:\.\d{1,2})?)/);
    const agrees = !amount && /\b(deal|okay|ok|yes|sure|accept)\b/i.test(text);
    return schema.parse({
      offerCents: amount ? Math.round(Number(amount[1]) * 100) : null,
      conditions: [],
      intent: agrees ? 'accept' : amount ? 'offer' : 'question',
    });
  },
  async vision() {
    throw new Error('mockLlm has no vision');
  },
  async text(messages) {
    const prompt = messages.map((m) => m.content).join('\n');
    const action = prompt.match(/Decision: (\w+)\./)?.[1] as Decision['action'] | undefined;
    const dollars = prompt.match(/only price you may mention is \$([\d.]+)/)?.[1];
    if (!action || !dollars) return '';
    return templateReply({ action, priceCents: Math.round(Number(dollars) * 100), countsRound: true });
  },
};
