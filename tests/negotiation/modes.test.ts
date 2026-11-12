import { describe, expect, it } from 'vitest';
import type { Negotiation, Policy } from '@/lib/contracts';
import type { ListingLookup, ListingRef } from '@/lib/negotiation/listing-lookup';
import { createMemoryStore } from '@/lib/negotiation/memory-store';
import { mockLlm } from '@/lib/negotiation/mock-llm';
import { createNegotiationService } from '@/lib/negotiation/service';

const $ = (d: number) => d * 100;

const LISTINGS: Record<string, ListingRef> = {
  both: { ownerId: 'maya', modes: ['rent', 'sell'], depositCents: $(150), rentPerDayCents: $(40), salePriceCents: $(180) },
  rentonly: { ownerId: 'maya', modes: ['rent'], depositCents: $(150), rentPerDayCents: $(40) },
  forsale: { ownerId: 'sam', modes: ['sell'], depositCents: 0, salePriceCents: $(50) },
  loan: { ownerId: 'sam', modes: ['lend'], depositCents: $(60) },
  loanrent: { ownerId: 'sam', modes: ['rent', 'lend'], depositCents: $(60), rentPerDayCents: $(20) },
  nodeposit: { ownerId: 'sam', modes: ['lend'], depositCents: 0 },
};
const lookup: ListingLookup = async (id) => LISTINGS[id] ?? null;

const policy = (listingId: string, over: Partial<Policy> = {}): Policy => ({
  listingId,
  listPriceCents: $(40),
  floorCents: $(25),
  autoAcceptCents: $(34),
  mode: 'full_auto',
  strategy: 'best_price',
  maxRounds: 3,
  tone: 'friendly',
  extrasAllowed: [],
  ...over,
});

async function setup(now = new Date('2026-11-04T12:00:00Z')) {
  const agreed: Negotiation[] = [];
  const clock = { now };
  const service = createNegotiationService({
    store: createMemoryStore({ seedHero: false, lookup }),
    llm: mockLlm,
    now: () => clock.now,
    onAgreed: async (n) => {
      agreed.push(n);
      return { dealId: `deal-${agreed.length}` };
    },
  });
  await service.createOrUpdatePolicy(policy('both'), 'maya');
  await service.createOrUpdatePolicy(policy('rentonly'), 'maya');
  await service.createOrUpdatePolicy(policy('loanrent', { listPriceCents: $(20), floorCents: $(15), autoAcceptCents: $(18) }), 'sam');
  await service.createOrUpdatePolicy(policy('forsale', { listPriceCents: $(50), floorCents: $(35), autoAcceptCents: $(45) }), 'sam');
  return { service, agreed, clock };
}

describe('mode checks', () => {
  it('refuses to sell what is only for rent, and to rent what is only for sale', async () => {
    const { service } = await setup();
    await expect(service.startNegotiation('rentonly', 'leo', 'sale')).rejects.toMatchObject({ status: 409 });
    await expect(service.startNegotiation('forsale', 'leo', 'rent', 1)).rejects.toMatchObject({ status: 409 });
  });

  it('needs a policy for a priced negotiation', async () => {
    const { service } = await setup();
    await expect(service.startNegotiation('both', 'leo', 'sale')).resolves.toBeTruthy();
    const store = createMemoryStore({ seedHero: false, lookup });
    const bare = createNegotiationService({ store, llm: mockLlm });
    await expect(bare.startNegotiation('both', 'leo', 'sale')).rejects.toMatchObject({ status: 409 });
  });
});

describe('one policy, two prices', () => {
  it('a sale on a rent-priced policy runs on the scaled price and floor', async () => {
    const { service } = await setup();
    const { id } = await service.startNegotiation('both', 'leo', 'sale');

    const owner = await service.getTheaterView(id, 'maya');
    expect(owner).toMatchObject({ listPriceCents: $(180), floorCents: $(112.5) }); // 25/40 of $180
    expect((await service.getTheaterView(id, 'leo')).floorCents).toBeUndefined();

    const r1 = await service.handleBuyerMessage(id, 'Would you take $50?', 'leo');
    expect(r1.negotiation.lastCounterCents).toBeGreaterThanOrEqual($(112.5));
    expect(r1.negotiation.lastCounterCents).toBeLessThan($(180));
  });

  it('never agrees to a sale below the scaled floor, however the buyer pushes', async () => {
    const { service } = await setup();
    const { id } = await service.startNegotiation('both', 'leo', 'sale');
    let last: Awaited<ReturnType<typeof service.handleBuyerMessage>> | undefined;
    for (const t of ['$20', '$60', '$100']) last = await service.handleBuyerMessage(id, `How about ${t}?`, 'leo');
    expect(last!.negotiation.status).not.toBe('agreed');
    const final = await service.handleBuyerMessage(id, '$112.50 and pickup', 'leo').catch(() => last);
    if (final!.negotiation.agreedCents !== undefined) expect(final!.negotiation.agreedCents).toBeGreaterThanOrEqual($(112.5));
  });

  it('the rental on the same listing still runs on the policy as written', async () => {
    const { service } = await setup();
    const { id } = await service.startNegotiation('both', 'leo', 'rent', 1);
    expect(await service.getTheaterView(id, 'maya')).toMatchObject({ listPriceCents: $(40), floorCents: $(25) });
  });
});

describe('free loans', () => {
  it('a lend-only listing starts agreed at $0 and creates the deal straight away', async () => {
    const { service, agreed } = await setup();
    const n = await service.startNegotiation('loan', 'leo', 'rent', 2);
    expect(n).toMatchObject({ status: 'agreed', agreedCents: 0, rentDays: 2, dealId: 'deal-1' });
    expect(agreed).toHaveLength(1);
  });

  it('the Theater needs no policy for a loan, and the owner has no floor to see', async () => {
    const { service } = await setup();
    const { id } = await service.startNegotiation('loan', 'leo', 'rent', 1);
    for (const viewer of ['leo', 'sam']) {
      expect(await service.getTheaterView(id, viewer)).toMatchObject({ listPriceCents: 0, floorCents: undefined });
    }
  });

  it('borrow: true on a rent-and-lend listing is a loan; without it, a paid rental', async () => {
    const { service } = await setup();
    expect(await service.startNegotiation('loanrent', 'leo', 'rent', 1, { borrow: true })).toMatchObject({ agreedCents: 0, status: 'agreed' });
    expect(await service.startNegotiation('loanrent', 'leo', 'rent', 1)).toMatchObject({ status: 'open' });
  });

  it('a loan needs no deposit: the deposit hold is optional', async () => {
    const { service } = await setup();
    expect(await service.startNegotiation('nodeposit', 'leo', 'rent', 1)).toMatchObject({ status: 'agreed', agreedCents: 0 });
  });

  it('refuses a loan on something that is not lent', async () => {
    const { service } = await setup();
    await expect(service.startNegotiation('both', 'leo', 'rent', 1, { borrow: true })).rejects.toMatchObject({ status: 409 });
  });

  it('keeps the 1-29 day limit', async () => {
    const { service } = await setup();
    await expect(service.startNegotiation('loan', 'leo', 'rent', 30)).rejects.toMatchObject({ status: 400 });
    await expect(service.startNegotiation('loan', 'leo', 'rent')).rejects.toMatchObject({ status: 400 });
  });
});

describe('expiry', () => {
  it('closes a negotiation past the owner’s deadline instead of continuing it', async () => {
    const { service, clock } = await setup();
    await service.createOrUpdatePolicy(policy('rentonly', { deadline: '2026-11-10T00:00:00.000Z' }), 'maya');
    const { id } = await service.startNegotiation('rentonly', 'leo', 'rent', 1);
    await service.handleBuyerMessage(id, 'Would you take $20?', 'leo'); // before the deadline: fine

    clock.now = new Date('2026-11-11T00:00:00Z');
    await expect(service.handleBuyerMessage(id, '$30', 'leo')).rejects.toMatchObject({ status: 409 });
    expect((await service.getNegotiation(id, 'leo')).negotiation.status).toBe('expired');
  });
});

describe('listing a user’s negotiations', () => {
  it('shows each person their own, with their role, and flags the offers waiting on the owner', async () => {
    const { service } = await setup();
    await service.createOrUpdatePolicy(policy('rentonly', { mode: 'ask_me' }), 'maya');
    const { id } = await service.startNegotiation('rentonly', 'leo', 'rent', 1);
    await service.handleBuyerMessage(id, 'How about $30?', 'leo'); // between floor and auto-accept: owner decides
    await service.startNegotiation('forsale', 'leo', 'sale'); // another one, owned by sam

    const leo = await service.listFor('leo');
    expect(leo).toHaveLength(2);
    expect(leo.every((r) => r.role === 'buyer' && !r.needsYou)).toBe(true);

    const maya = await service.listFor('maya');
    expect(maya).toHaveLength(1);
    expect(maya[0]).toMatchObject({ role: 'owner', needsYou: true });

    expect(await service.listFor('sam')).toHaveLength(1);
    expect(await service.listFor('nobody')).toEqual([]);
  });
});
