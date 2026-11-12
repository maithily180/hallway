/**
 * Runs the real Prisma stores against a real Postgres. Skipped unless DATABASE_URL is set:
 *
 *   DATABASE_URL=postgresql://... pnpm db:deploy && DATABASE_URL=postgresql://... pnpm test
 *
 * PayPal and the LLM stay mocked; this checks persistence, JSON queries and dedupe.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Negotiation } from '@/lib/contracts';

const enabled = !!process.env.DATABASE_URL;

describe.skipIf(!enabled)('Prisma stores against Postgres', () => {
  let db: typeof import('@/lib/db').db;
  let negotiation: ReturnType<typeof import('@/lib/negotiation/service').createNegotiationService>;
  let deals: ReturnType<typeof import('@/lib/engine/deals').createDealService>;
  let dealStore: typeof import('@/lib/engine/prisma-store').prismaDealStore;
  let signHandoverToken: typeof import('@/lib/engine/handover-token').signHandoverToken;
  let ids: { listing: string; maya: string; leo: string };

  const policy = (listingId: string) => ({
    listingId,
    listPriceCents: 4000,
    floorCents: 2500,
    autoAcceptCents: 3400,
    mode: 'full_auto' as const,
    strategy: 'best_price' as const,
    maxRounds: 3,
    tone: 'friendly' as const,
    extrasAllowed: ['include HDMI cable'],
    deadline: '2026-11-10T00:00:00.000Z',
  });

  async function agreedNegotiation(kind: 'sale' | 'rent'): Promise<Negotiation> {
    const { id } = await negotiation.startNegotiation(ids.listing, ids.leo, kind, kind === 'rent' ? 1 : undefined);
    let last;
    // The listing is for rent ($40/day) and for sale ($180): a sale runs on the scaled price and floor.
    const script = kind === 'rent' ? ['Would you take $15?', 'How about $26?', '$28 pls'] : ['$160 pls'];
    for (const m of script) {
      last = await negotiation.handleBuyerMessage(id, m);
    }
    return last!.negotiation;
  }

  beforeAll(async () => {
    ({ db } = await import('@/lib/db'));
    const { prismaStore } = await import('@/lib/negotiation/prisma-store');
    ({ prismaDealStore: dealStore } = await import('@/lib/engine/prisma-store'));
    ({ signHandoverToken } = await import('@/lib/engine/handover-token'));
    const { createNegotiationService } = await import('@/lib/negotiation/service');
    const { createDealService } = await import('@/lib/engine/deals');
    const { createMockPayPal } = await import('@/lib/paypal/mock');
    const { mockLlm } = await import('@/lib/negotiation/mock-llm');

    for (const table of ['webhookEvent', 'inspection', 'deal', 'negoMessage', 'negotiation', 'policy', 'listing', 'user', 'community'] as const) {
      await (db[table] as { deleteMany: () => Promise<unknown> }).deleteMany();
    }
    const community = await db.community.create({
      data: { name: 'Demo University', emailDomain: 'demo.edu', pickupSpots: ['Library steps', 'Tower B lobby'] },
    });
    const maya = await db.user.create({
      data: { name: 'Maya', email: 'maya@demo.edu', communityId: community.id, paypalEmail: 'maya-sandbox@example.test' },
    });
    const leo = await db.user.create({ data: { name: 'Leo', email: 'leo@demo.edu', communityId: community.id } });
    const listing = await db.listing.create({
      data: {
        ownerId: maya.id,
        communityId: community.id,
        title: 'Projector',
        category: 'projector',
        description: 'Works great',
        conditionGrade: 'good',
        defects: [],
        photos: [],
        modes: ['rent', 'sell'],
        salePriceCents: 18000,
        rentPerDayCents: 4000,
        depositCents: 15000,
      },
    });
    ids = { listing: listing.id, maya: maya.id, leo: leo.id };

    const paypal = createMockPayPal();
    deals = createDealService({ store: dealStore, paypal, payeeMode: 'platform' });
    negotiation = createNegotiationService({
      store: prismaStore,
      llm: mockLlm,
      now: () => new Date('2026-11-04T12:00:00Z'),
      onAgreed: async (n) => ({ dealId: (await deals.createFromNegotiation(n)).id }),
    });
    await negotiation.createOrUpdatePolicy(policy(ids.listing), ids.maya);
  });

  afterAll(async () => {
    await db?.$disconnect();
  });

  it('round-trips a policy, including the deadline, and never exposes the floor in the view', async () => {
    const view = await negotiation.getPolicyView(ids.listing);
    expect(view.deadline).toBe('2026-11-10T00:00:00.000Z');
    expect(JSON.stringify(view)).not.toMatch(/floorCents|autoAcceptCents/);
    const row = await db.policy.findUniqueOrThrow({ where: { listingId: ids.listing } });
    expect(row.floorCents).toBe(2500);
  });

  it('only lets the owner change the policy', async () => {
    await expect(negotiation.createOrUpdatePolicy(policy(ids.listing), ids.leo)).rejects.toMatchObject({ status: 403 });
  });

  it('runs the demo negotiation and stores the audit trail', async () => {
    const n = await agreedNegotiation('rent');
    expect(n).toMatchObject({ status: 'agreed', agreedCents: 2800, round: 3 });
    expect(n.dealId).toBeTruthy();

    const { messages } = await negotiation.getNegotiation(n.id);
    expect(messages).toHaveLength(6);
    expect(messages[0].parsedOffer).toMatchObject({ offerCents: 1500, intent: 'offer' });

    const theater = await negotiation.getTheaterView(n.id, ids.maya);
    expect(theater.floorCents).toBe(2500);
    expect((await negotiation.getTheaterView(n.id, ids.leo)).floorCents).toBeUndefined();
  });

  it('settles a rental end to end and records every PayPal id', async () => {
    const n = await agreedNegotiation('rent');
    const dealId = n.dealId!;

    const { paypalOrderId } = await deals.pay(dealId, ids.leo);
    // double click: one order
    expect((await deals.pay(dealId, ids.leo)).paypalOrderId).toBe(paypalOrderId);

    const held = await deals.approve(dealId, paypalOrderId, ids.leo);
    expect(held).toMatchObject({ state: 'HELD', amountCents: 2800, depositCents: 15000 });

    await deals.handover(dealId, signHandoverToken(dealId), ['before.jpg'], ids.maya);
    const returned = await deals.returnItem(dealId, ['after.jpg'], ids.leo);
    expect(returned.deal.state).toBe('RETURNED');

    const done = await deals.settle(dealId, { deductionCents: 0, ownerOk: true, renterOk: true });
    expect(done.state).toBe('SETTLED');

    const row = await db.deal.findUniqueOrThrow({ where: { id: dealId } });
    expect(row.state).toBe('SETTLED');
    expect((row.timeline as { state: string }[]).map((t) => t.state)).toEqual([
      'AGREED', 'AWAITING_PAYMENT', 'HELD', 'OUT', 'RETURNED', 'SETTLED',
    ]);
    const inspection = await db.inspection.findUniqueOrThrow({ where: { dealId } });
    expect(inspection.beforePhotos).toEqual(['before.jpg']);
    expect(inspection.afterPhotos).toEqual(['after.jpg']);
    expect(inspection.ownerDecision).toBe('ok');
  });

  it('finds a deal by any PayPal id, which is how webhooks locate it', async () => {
    const deal = (await dealStore.listDeals({ ownerId: ids.maya, type: 'rent' })).find((d) => d.state === 'SETTLED')!;
    const { orderId, authorizationId, payoutBatchId } = deal.paypal;
    const captureId = deal.paypal.captureIds[0];
    expect(orderId && authorizationId && payoutBatchId && captureId).toBeTruthy();

    for (const ref of [{ orderId }, { authorizationId }, { captureId }, { payoutBatchId }]) {
      expect((await dealStore.findDealByPayPalId(ref))?.id).toBe(deal.id);
    }
    expect(await dealStore.findDealByPayPalId({ orderId: 'NOPE' })).toBeNull();
    expect(await dealStore.findDealByPayPalId({})).toBeNull();
  });

  it('settles a sale with one capture and a payout, even with concurrent approves', async () => {
    const n = await agreedNegotiation('sale');
    const dealId = n.dealId!;
    const { paypalOrderId } = await deals.pay(dealId, ids.leo);
    const [a, b] = await Promise.all([
      deals.approve(dealId, paypalOrderId, ids.leo),
      deals.approve(dealId, paypalOrderId, ids.leo),
    ]);
    expect(a.state).toBe('SETTLED');
    expect(b.paypal.captureIds).toEqual(a.paypal.captureIds);
    expect((await dealStore.getDeal(dealId))?.paypal.captureIds).toHaveLength(1);
  });

  it('dedupes webhook events with the unique id', async () => {
    expect(await dealStore.recordWebhookEvent('WH-DB-1', 'PAYMENT.CAPTURE.COMPLETED')).toBe(true);
    expect(await dealStore.recordWebhookEvent('WH-DB-1', 'PAYMENT.CAPTURE.COMPLETED')).toBe(false);
  });

  it('filters deals for the owner calendar', async () => {
    const rentals = await dealStore.listDeals({ ownerId: ids.maya, type: 'rent' });
    expect(rentals.length).toBeGreaterThanOrEqual(2);
    expect(rentals.every((d) => d.sellerId === ids.maya && d.type === 'rent')).toBe(true);
    expect(await dealStore.listDeals({ buyerId: 'nobody' })).toEqual([]);
  });
});

describe.skipIf(!enabled)('seeded marketplace (hosted mode)', () => {
  type Db = typeof import('@/lib/db').db;
  let db: Db;

  beforeAll(async () => {
    process.env.SANDBOX_MAYA_EMAIL = 'maya-sandbox@example.test';
    ({ db } = await import('@/lib/db'));
    for (const table of ['webhookEvent', 'inspection', 'deal', 'negoMessage', 'negotiation', 'policy', 'listing', 'user', 'community'] as const) {
      await (db[table] as { deleteMany: () => Promise<unknown> }).deleteMany();
    }
  });

  afterAll(async () => {
    await db?.$disconnect();
  });

  it('seeds idempotently: running it twice changes nothing', async () => {
    const { seedDemo } = await import('@/lib/db-seed');
    const first = await seedDemo();
    const counts = async () => [await db.user.count(), await db.listing.count(), await db.policy.count()];
    const after1 = await counts();
    const second = await seedDemo();
    expect(second).toEqual(first);
    expect(await counts()).toEqual(after1);
    const { DEMO_LISTINGS } = await import('@/seed/demo');
    expect(after1[1]).toBe(DEMO_LISTINGS.length);
  });

  it('gives the hero projector the demo policy and the owner a payout email', async () => {
    const policy = await db.policy.findUniqueOrThrow({ where: { listingId: 'hero-projector' } });
    expect(policy).toMatchObject({ listPriceCents: 4000, floorCents: 2500, autoAcceptCents: 3400, maxRounds: 3 });
    expect((await db.user.findUniqueOrThrow({ where: { id: 'maya' } })).paypalEmail).toBe('maya-sandbox@example.test');
  });

  it('never overwrites a policy an owner already chose', async () => {
    await db.policy.update({ where: { listingId: 'hero-projector' }, data: { floorCents: 3000 } });
    const { seedDemo } = await import('@/lib/db-seed');
    await seedDemo();
    expect((await db.policy.findUniqueOrThrow({ where: { listingId: 'hero-projector' } })).floorCents).toBe(3000);
    await db.policy.update({ where: { listingId: 'hero-projector' }, data: { floorCents: 2500 } });
  });

  it('gives every priced listing a policy so "make an offer" works on all of them', async () => {
    const listings = await db.listing.findMany();
    const policies = new Set((await db.policy.findMany()).map((p) => p.listingId));
    const unpriced = listings.filter((l) => !policies.has(l.id));
    expect(unpriced.every((l) => !l.rentPerDayCents && !l.salePriceCents)).toBe(true);
  });

  it('the app listing store reads Postgres in hosted mode', async () => {
    const { getListingStore } = await import('@/lib/agents/listings');
    const hero = await getListingStore().get('hero-projector');
    expect(hero).toMatchObject({ ownerId: 'maya', depositCents: 15000, rentPerDayCents: 4000 });
    const { DEMO_LISTINGS } = await import('@/seed/demo');
    expect((await getListingStore().list('demo-u')).length).toBe(DEMO_LISTINGS.length);
    expect(await getListingStore().get('nope')).toBeUndefined();
  });

  it('runs the hero demo end to end on the seeded data', async () => {
    const { prismaStore } = await import('@/lib/negotiation/prisma-store');
    const { prismaDealStore } = await import('@/lib/engine/prisma-store');
    const { createNegotiationService } = await import('@/lib/negotiation/service');
    const { createDealService } = await import('@/lib/engine/deals');
    const { createMockPayPal } = await import('@/lib/paypal/mock');
    const { mockLlm } = await import('@/lib/negotiation/mock-llm');
    const { signHandoverToken } = await import('@/lib/engine/handover-token');

    const deals = createDealService({ store: prismaDealStore, paypal: createMockPayPal(), payeeMode: 'platform' });
    const negotiation = createNegotiationService({
      store: prismaStore,
      llm: mockLlm,
      now: () => new Date('2026-11-04T12:00:00Z'),
      onAgreed: async (n) => ({ dealId: (await deals.createFromNegotiation(n)).id }),
    });

    const { id } = await negotiation.startNegotiation('hero-projector', 'leo', 'rent', 1);
    let last;
    for (const m of ['Would you take $15?', 'How about $26?', '$28 pls']) last = await negotiation.handleBuyerMessage(id, m, 'leo');
    expect(last!.negotiation).toMatchObject({ status: 'agreed', agreedCents: 2800 });

    const dealId = last!.negotiation.dealId!;
    const { paypalOrderId } = await deals.pay(dealId, 'leo');
    expect((await deals.approve(dealId, paypalOrderId, 'leo')).state).toBe('HELD');
    await deals.handover(dealId, signHandoverToken(dealId), ['before.jpg'], 'maya');
    await deals.returnItem(dealId, ['after.jpg'], 'leo');
    const done = await deals.settle(dealId, { deductionCents: 0, ownerOk: true, renterOk: false }, 'maya');
    expect(done).toMatchObject({ state: 'SETTLED', sellerId: 'maya', buyerId: 'leo' });
    expect(done.paypal.payoutBatchId).toBeTruthy();
  });
});

describe.skipIf(!enabled)('free loans and scaled prices against Postgres', () => {
  it('runs a free loan through to a voided hold, and scales the price for the other mode', async () => {
    const { db } = await import('@/lib/db');
    const { prismaStore } = await import('@/lib/negotiation/prisma-store');
    const { prismaDealStore } = await import('@/lib/engine/prisma-store');
    const { createNegotiationService } = await import('@/lib/negotiation/service');
    const { createDealService } = await import('@/lib/engine/deals');
    const { createMockPayPal } = await import('@/lib/paypal/mock');
    const { mockLlm } = await import('@/lib/negotiation/mock-llm');
    const { signHandoverToken } = await import('@/lib/engine/handover-token');

    const base = { communityId: 'demo-u', category: 'tools', description: 'd', conditionGrade: 'good', defects: [], photos: [] };
    await db.listing.upsert({
      where: { id: 'loan-ladder' },
      update: {},
      create: { id: 'loan-ladder', ownerId: 'priya', title: 'Ladder', modes: ['lend'], depositCents: 6000, ...base },
    });
    await db.listing.upsert({
      where: { id: 'both-modes' },
      update: {},
      create: { id: 'both-modes', ownerId: 'maya', title: 'Drill', modes: ['rent', 'sell'], rentPerDayCents: 1000, salePriceCents: 8000, depositCents: 3000, ...base },
    });

    const mock = createMockPayPal();
    const deals = createDealService({ store: prismaDealStore, paypal: mock, payeeMode: 'platform' });
    const negotiation = createNegotiationService({
      store: prismaStore,
      llm: mockLlm,
      onAgreed: async (n) => ({ dealId: (await deals.createFromNegotiation(n)).id }),
    });

    // free loan: starts agreed at $0, holds only the deposit, and a clean return voids the hold
    const loan = await negotiation.startNegotiation('loan-ladder', 'leo', 'rent', 2);
    expect(loan).toMatchObject({ status: 'agreed', agreedCents: 0 });
    const dealId = loan.dealId!;
    const { paypalOrderId } = await deals.pay(dealId, 'leo');
    expect((await deals.approve(dealId, paypalOrderId, 'leo')).state).toBe('HELD');
    await deals.handover(dealId, signHandoverToken(dealId), ['b.jpg'], 'priya');
    await deals.returnItem(dealId, ['a.jpg'], 'leo');
    const done = await deals.settle(dealId, { deductionCents: 0, ownerOk: true, renterOk: false }, 'priya');
    expect(done).toMatchObject({ type: 'borrow', amountCents: 0, depositCents: 6000, state: 'SETTLED' });
    const row = await db.deal.findUniqueOrThrow({ where: { id: dealId } });
    expect((row.paypal as { captureIds: string[] }).captureIds).toEqual([]);

    // a drill offered for rent and for sale: the sale runs on the $80 price, with the floor scaled to it
    await db.policy.upsert({
      where: { listingId: 'both-modes' },
      update: {},
      create: { listingId: 'both-modes', listPriceCents: 1000, floorCents: 700, autoAcceptCents: 900, mode: 'full_auto', strategy: 'best_price', maxRounds: 3, tone: 'friendly', extrasAllowed: [] },
    });
    const sale = await negotiation.startNegotiation('both-modes', 'leo', 'sale');
    expect(await negotiation.getTheaterView(sale.id, 'maya')).toMatchObject({ listPriceCents: 8000, floorCents: 5600 });
    expect((await negotiation.getTheaterView(sale.id, 'leo')).floorCents).toBeUndefined();
  });

  it('lists a user’s negotiations and finds deals by state', async () => {
    const { prismaStore } = await import('@/lib/negotiation/prisma-store');
    const { prismaDealStore } = await import('@/lib/engine/prisma-store');
    expect((await prismaStore.listNegotiationsFor('leo')).length).toBeGreaterThan(0);
    expect((await prismaStore.listNegotiationsFor('maya')).length).toBeGreaterThan(0); // as owner of listings
    expect(await prismaStore.listNegotiationsFor('nobody')).toEqual([]);

    const settled = await prismaDealStore.listDeals({ states: ['SETTLED'] });
    expect(settled.length).toBeGreaterThan(0);
    expect(settled.every((d) => d.state === 'SETTLED')).toBe(true);
    expect(await prismaDealStore.listDeals({ states: ['HELD', 'OUT'] })).toEqual(
      (await prismaDealStore.listDeals({})).filter((d) => d.state === 'HELD' || d.state === 'OUT'),
    );
  });
});
