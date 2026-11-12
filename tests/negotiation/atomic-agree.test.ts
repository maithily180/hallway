import { describe, expect, it } from 'vitest';
import type { Negotiation } from '@/lib/contracts';
import { createMemoryStore, HERO_LISTING_ID } from '@/lib/negotiation/memory-store';
import { mockLlm } from '@/lib/negotiation/mock-llm';
import { createNegotiationService } from '@/lib/negotiation/service';
import type { NegotiationStore } from '@/lib/negotiation/store';

const SCRIPT = ['Would you take $15?', 'How about $26?', '$28 pls'];

/** A store that records every update, so tests can see exactly what was written and when. */
function recordingStore() {
  const inner = createMemoryStore();
  const updates: Parameters<NegotiationStore['updateNegotiation']>[1][] = [];
  const store: NegotiationStore = {
    ...inner,
    async updateNegotiation(id, patch) {
      updates.push(patch);
      return inner.updateNegotiation(id, patch);
    },
  };
  return { store, updates };
}

async function playUntilLastMessage(service: ReturnType<typeof createNegotiationService>) {
  const { id } = await service.startNegotiation(HERO_LISTING_ID, 'leo', 'rent', 1);
  for (const m of SCRIPT.slice(0, -1)) await service.handleBuyerMessage(id, m, 'leo');
  return id;
}

describe('agreeing is all-or-nothing', () => {
  it('writes the status and the dealId together, never "agreed" without a deal', async () => {
    const { store, updates } = recordingStore();
    const service = createNegotiationService({ store, llm: mockLlm, onAgreed: async () => ({ dealId: 'deal-1' }) });
    const id = await playUntilLastMessage(service);
    const final = await service.handleBuyerMessage(id, SCRIPT.at(-1)!, 'leo');

    expect(final.negotiation).toMatchObject({ status: 'agreed', agreedCents: 2800, dealId: 'deal-1' });
    const agreedWrites = updates.filter((u) => u.status === 'agreed');
    expect(agreedWrites).toHaveLength(1);
    expect(agreedWrites[0].dealId).toBe('deal-1'); // the same write
  });

  it('if the deal cannot be created, the negotiation stays open instead of getting stuck "agreed"', async () => {
    let fail = true;
    const { store } = recordingStore();
    const service = createNegotiationService({
      store,
      llm: mockLlm,
      onAgreed: async () => {
        if (fail) throw new Error('database hiccup');
        return { dealId: 'deal-after-retry' };
      },
    });
    const id = await playUntilLastMessage(service);

    await expect(service.handleBuyerMessage(id, SCRIPT.at(-1)!, 'leo')).rejects.toThrow('database hiccup');
    const stuck = (await service.getNegotiation(id, 'leo')).negotiation;
    expect(stuck.status).toBe('open'); // not "agreed" with no deal
    expect(stuck.dealId).toBeUndefined();
    expect(stuck.round).toBe(3); // the round that was played is kept

    fail = false; // the buyer just sends the offer again
    const retry = await service.handleBuyerMessage(id, SCRIPT.at(-1)!, 'leo').catch((e) => e);
    // the policy's rounds are used up, so the engine accepts anything at or above the floor
    expect(retry).not.toBeInstanceOf(Error);
    expect((retry as { negotiation: Negotiation }).negotiation).toMatchObject({ status: 'agreed', dealId: 'deal-after-retry' });
  });

  it('a free loan whose deal cannot be created is not created at all', async () => {
    const { store } = recordingStore();
    const lookup = async () => ({ ownerId: 'priya', modes: ['lend' as const], depositCents: 0 });
    const loanStore = createMemoryStore({ seedHero: false, lookup });
    const service = createNegotiationService({
      store: { ...loanStore },
      llm: mockLlm,
      onAgreed: async () => {
        throw new Error('no deal');
      },
    });
    void store;
    await expect(service.startNegotiation('ladder', 'leo', 'rent', 1)).rejects.toThrow('no deal');
    expect(await service.listFor('leo')).toEqual([]); // no half-made negotiation left behind
  });

  it('an owner accepting an "ask me" offer stays waiting if the deal cannot be created', async () => {
    let fail = true;
    const inner = createMemoryStore();
    const service = createNegotiationService({
      store: inner,
      llm: mockLlm,
      onAgreed: async () => {
        if (fail) throw new Error('no deal');
        return { dealId: 'deal-2' };
      },
    });
    await service.createOrUpdatePolicy(
      {
        listingId: HERO_LISTING_ID,
        listPriceCents: 4000,
        floorCents: 2500,
        autoAcceptCents: 3400,
        mode: 'ask_me',
        strategy: 'best_price',
        maxRounds: 3,
        tone: 'friendly',
        extrasAllowed: [],
      },
      'maya',
    );
    const { id } = await service.startNegotiation(HERO_LISTING_ID, 'leo', 'rent', 1);
    await service.handleBuyerMessage(id, 'How about $30?', 'leo');
    expect((await service.getNegotiation(id, 'maya')).negotiation.status).toBe('needs_seller');

    await expect(service.sellerDecision(id, 'accept', 'maya')).rejects.toThrow('no deal');
    expect((await service.getNegotiation(id, 'maya')).negotiation.status).toBe('needs_seller'); // still waiting, not stuck

    fail = false;
    expect((await service.sellerDecision(id, 'accept', 'maya')).negotiation).toMatchObject({ status: 'agreed', dealId: 'deal-2' });
  });
});
