import { beforeEach, describe, expect, it } from 'vitest';
import type { InspectionResult, Negotiation } from '@/lib/contracts';
import { createDealService, type DealService } from '@/lib/engine/deals';
import { signHandoverToken } from '@/lib/engine/handover-token';
import { createMemoryDealStore } from '@/lib/engine/memory-store';
import { createNegotiationService } from '@/lib/negotiation/service';
import { createMemoryStore, HERO_LISTING_ID } from '@/lib/negotiation/memory-store';
import { mockLlm } from '@/lib/negotiation/mock-llm';
import { createMockPayPal } from '@/lib/paypal/mock';

const paypal = createMockPayPal();
let store = createMemoryDealStore();
let svc: DealService;

const damaged = async (): Promise<InspectionResult> => ({
  sameItem: true,
  newDamage: [{ description: 'scratch', photoIndex: 0 }],
  missingParts: [],
  confidence: 0.9,
  proposedDeductionCents: 4000,
  summary: 'scratch',
});

const agreed: Negotiation = {
  id: 'n1',
  listingId: HERO_LISTING_ID,
  buyerId: 'leo',
  kind: 'rent',
  rentDays: 1,
  round: 3,
  status: 'agreed',
  agreedCents: 2800,
};

/** A rental that has been returned and is waiting to settle. */
async function returned() {
  const deal = await svc.createFromNegotiation(agreed);
  const { paypalOrderId } = await svc.pay(deal.id, 'leo');
  await svc.approve(deal.id, paypalOrderId, 'leo');
  await svc.handover(deal.id, signHandoverToken(deal.id), ['b.jpg'], 'maya');
  await svc.returnItem(deal.id, ['a.jpg'], 'leo');
  return deal.id;
}

beforeEach(() => {
  paypal.reset();
  store = createMemoryDealStore();
  svc = createDealService({ store, paypal, payeeMode: 'platform', inspect: damaged });
});

describe('who can see and cancel a deal', () => {
  it('only the buyer and the seller may read it', async () => {
    const deal = await svc.createFromNegotiation(agreed);
    await expect(svc.getDeal(deal.id, 'leo')).resolves.toBeTruthy();
    await expect(svc.getDeal(deal.id, 'maya')).resolves.toBeTruthy();
    await expect(svc.getDeal(deal.id, 'sam')).rejects.toMatchObject({ status: 403 });
    await expect(svc.getInspection(deal.id, 'sam')).rejects.toMatchObject({ status: 403 });
  });

  it('a stranger cannot cancel', async () => {
    const deal = await svc.createFromNegotiation(agreed);
    await expect(svc.cancel(deal.id, 'sam')).rejects.toMatchObject({ status: 403 });
    await expect(svc.cancel(deal.id, 'leo')).resolves.toMatchObject({ state: 'VOIDED' });
  });
});

describe('settle: each side only speaks for itself', () => {
  it('the owner cannot claim the renter agreed: a deduction waits for the renter', async () => {
    const id = await returned();
    // owner says "ok" and also lies that the renter agreed; the body field is ignored
    const claimed = await svc.settle(id, { deductionCents: 4000, ownerOk: true, renterOk: true }, 'maya');
    expect(claimed.state).toBe('CLAIMED');
    expect(claimed.paypal.captureIds).toEqual([]);
  });

  it('the renter accepting the owner’s figure releases the capture, at the owner’s number', async () => {
    const id = await returned();
    await svc.settle(id, { deductionCents: 4000, ownerOk: true, renterOk: false }, 'maya');
    // the renter cannot choose a different figure; only accept or dispute
    const done = await svc.settle(id, { deductionCents: 1, ownerOk: false, renterOk: true }, 'leo');
    expect(done.state).toBe('SETTLED');
    expect(done.paypal.captureIds).toHaveLength(1);
    expect((await svc.getInspection(id, 'maya'))?.deductionCents).toBe(4000);
  });

  it('a renter dispute keeps it in CLAIMED, and a changed figure resets their consent', async () => {
    const id = await returned();
    await svc.settle(id, { deductionCents: 4000, ownerOk: true, renterOk: false }, 'maya');
    expect((await svc.settle(id, { renterOk: false, deductionCents: 0, ownerOk: false }, 'leo')).state).toBe('CLAIMED');

    // renter accepted an earlier figure... then the owner raises it: consent must not carry over
    const id2 = await returned();
    await svc.settle(id2, { deductionCents: 1000, ownerOk: true, renterOk: false }, 'maya');
    await store.saveInspection({ ...(await store.getInspection(id2))!, renterDecision: 'ok' });
    const after = await svc.settle(id2, { deductionCents: 9000, ownerOk: true, renterOk: false }, 'maya');
    expect(after.state).toBe('CLAIMED');
    expect(after.paypal.captureIds).toEqual([]);
  });

  it('the renter cannot settle on their own when there is no deduction', async () => {
    const id = await returned();
    await expect(svc.settle(id, { deductionCents: 0, ownerOk: false, renterOk: true }, 'leo')).rejects.toMatchObject({
      status: 409,
    });
  });

  it('a clean return settles with the owner alone', async () => {
    const id = await returned();
    const done = await svc.settle(id, { deductionCents: 0, ownerOk: true, renterOk: false }, 'maya');
    expect(done.state).toBe('SETTLED');
  });

  it('strangers cannot settle', async () => {
    const id = await returned();
    await expect(svc.settle(id, { deductionCents: 0, ownerOk: true, renterOk: true }, 'sam')).rejects.toMatchObject({
      status: 403,
    });
  });

  it('a deduction above the deposit is rejected', async () => {
    const id = await returned();
    await expect(
      svc.settle(id, { deductionCents: 15001, ownerOk: true, renterOk: false }, 'maya'),
    ).rejects.toMatchObject({ status: 400 });
  });
});

describe('negotiation access', () => {
  const setup = () => {
    const ns = createNegotiationService({ store: createMemoryStore(), llm: mockLlm });
    return ns;
  };

  it('only the buyer can send offers', async () => {
    const ns = setup();
    const { id } = await ns.startNegotiation(HERO_LISTING_ID, 'leo', 'rent', 1);
    await expect(ns.handleBuyerMessage(id, 'How about $30?', 'maya')).rejects.toMatchObject({ status: 403 });
    await expect(ns.handleBuyerMessage(id, 'How about $30?', 'sam')).rejects.toMatchObject({ status: 403 });
    await expect(ns.handleBuyerMessage(id, 'How about $30?', 'leo')).resolves.toBeTruthy();
  });

  it('writing a policy needs a real listing you own', async () => {
    const ns = setup();
    const policy = {
      listingId: 'does-not-exist',
      listPriceCents: 4000,
      floorCents: 2500,
      autoAcceptCents: 3400,
      mode: 'full_auto' as const,
      strategy: 'best_price' as const,
      maxRounds: 3,
      tone: 'friendly' as const,
      extrasAllowed: [],
    };
    await expect(ns.createOrUpdatePolicy(policy, 'maya')).rejects.toMatchObject({ status: 404 });
    await expect(ns.createOrUpdatePolicy({ ...policy, listingId: HERO_LISTING_ID }, 'sam')).rejects.toMatchObject({
      status: 403,
    });
  });
});
