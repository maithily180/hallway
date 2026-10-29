import { beforeEach, describe, expect, it } from 'vitest';
import type { InspectionResult, Negotiation } from '@/lib/contracts';
import { createDealService, type DealService, type InspectFn } from '@/lib/engine/deals';
import { signHandoverToken } from '@/lib/engine/handover-token';
import { createMemoryDealStore } from '@/lib/engine/memory-store';
import { createMockPayPal } from '@/lib/paypal/mock';
import type { PayPalApi } from '@/lib/paypal';

const paypal = createMockPayPal();
let store = createMemoryDealStore();
let svc: DealService;
let clock = new Date('2026-11-04T19:00:00Z');
let inspector: InspectFn;

const result = (over: Partial<InspectionResult> = {}): InspectionResult => ({
  sameItem: true,
  newDamage: [],
  missingParts: [],
  confidence: 0.9,
  proposedDeductionCents: 0,
  summary: 'ok',
  ...over,
});

const agreed: Negotiation = {
  id: 'n1',
  listingId: 'listing-projector',
  buyerId: 'leo',
  kind: 'rent',
  rentDays: 1,
  round: 3,
  status: 'agreed',
  agreedCents: 2800,
};

/** Drive a rental to HELD ($28 rent + $150 deposit authorized). */
async function held(service: DealService = svc) {
  const deal = await service.createFromNegotiation(agreed);
  const { paypalOrderId } = await service.pay(deal.id, 'leo');
  return service.approve(deal.id, paypalOrderId, 'leo');
}

const handedOver = async () => {
  const deal = await held();
  return svc.handover(deal.id, signHandoverToken(deal.id), ['before-1.jpg'], 'maya');
};

const returned = async () => {
  const deal = await handedOver();
  await svc.returnItem(deal.id, ['after-1.jpg'], 'leo');
  return deal.id;
};

const settleClean = { deductionCents: 0, ownerOk: true, renterOk: true };

beforeEach(() => {
  paypal.reset();
  store = createMemoryDealStore();
  clock = new Date('2026-11-04T19:00:00Z');
  inspector = async () => result();
  svc = createDealService({
    store,
    paypal,
    payeeMode: 'platform',
    now: () => clock,
    inspect: (args) => inspector(args),
  });
});

describe('handover', () => {
  it('HELD -> OUT with a valid code, saving before photos', async () => {
    const deal = await handedOver();
    expect(deal.state).toBe('OUT');
    expect((await store.getInspection(deal.id))?.beforePhotos).toEqual(['before-1.jpg']);
  });

  it('rejects a wrong code, a missing photo set, and the wrong person', async () => {
    const deal = await held();
    await expect(svc.handover(deal.id, 'forged', ['a.jpg'], 'maya')).rejects.toMatchObject({ status: 400 });
    await expect(svc.handover(deal.id, signHandoverToken(deal.id), [], 'maya')).rejects.toMatchObject({ status: 400 });
    await expect(svc.handover(deal.id, signHandoverToken(deal.id), ['a.jpg'], 'leo')).rejects.toMatchObject({ status: 403 });
  });

  it('a code for one deal does not work on another', async () => {
    const a = await held();
    const b = await held();
    await expect(svc.handover(b.id, signHandoverToken(a.id), ['x.jpg'], 'maya')).rejects.toMatchObject({ status: 400 });
  });

  it('only the buyer can fetch the QR token; a repeat scan is harmless', async () => {
    const deal = await held();
    await expect(svc.handoverToken(deal.id, 'maya')).rejects.toMatchObject({ status: 403 });
    const token = await svc.handoverToken(deal.id, 'leo');
    await svc.handover(deal.id, token, ['a.jpg'], 'maya');
    expect((await svc.handover(deal.id, token, ['a.jpg'], 'maya')).state).toBe('OUT');
  });

  it('cannot cancel once the item is out', async () => {
    const deal = await handedOver();
    await expect(svc.cancel(deal.id)).rejects.toMatchObject({ status: 409 });
  });
});

describe('return', () => {
  it('OUT -> RETURNED, with the inspection stored', async () => {
    const out = await handedOver();
    const { deal, inspection } = await svc.returnItem(out.id, ['after-1.jpg'], 'leo');
    expect(deal.state).toBe('RETURNED');
    expect(inspection.proposedDeductionCents).toBe(0);
    expect((await store.getInspection(out.id))?.afterPhotos).toEqual(['after-1.jpg']);
  });

  it('clamps a proposed deduction to the deposit', async () => {
    inspector = async () => result({ proposedDeductionCents: 99999 });
    const out = await handedOver();
    const { inspection } = await svc.returnItem(out.id, ['after-1.jpg'], 'leo');
    expect(inspection.proposedDeductionCents).toBe(15000);
  });

  it('passes before and after photos to the inspector', async () => {
    let seen: unknown;
    inspector = async (args) => ((seen = args), result());
    const out = await handedOver();
    await svc.returnItem(out.id, ['after-1.jpg'], 'leo');
    expect(seen).toMatchObject({ before: ['before-1.jpg'], after: ['after-1.jpg'], listingId: 'listing-projector' });
  });

  it('requires after photos and the buyer', async () => {
    const out = await handedOver();
    await expect(svc.returnItem(out.id, [], 'leo')).rejects.toMatchObject({ status: 400 });
    await expect(svc.returnItem(out.id, ['a.jpg'], 'maya')).rejects.toMatchObject({ status: 403 });
  });
});

describe('settle: clean return', () => {
  it('captures only the rent with final_capture and pays the seller; the deposit is released', async () => {
    const id = await returned();
    const deal = await svc.settle(id, settleClean);
    expect(deal.state).toBe('SETTLED');
    expect(deal.paypal.captureIds).toHaveLength(1);
    expect(deal.paypal.payoutBatchId).toBeTruthy();
    expect(deal.timeline.map((t) => t.state)).toEqual([
      'AGREED',
      'AWAITING_PAYMENT',
      'HELD',
      'OUT',
      'RETURNED',
      'SETTLED',
    ]);
    // final_capture released the remainder: a second capture on this authorization is refused
    await expect(
      paypal.captureAuthorization({
        authorizationId: deal.paypal.authorizationId!,
        amountCents: 100,
        finalCapture: true,
        requestId: 'extra',
      }),
    ).rejects.toThrow();
  });

  it('is safe to settle twice or concurrently: one capture', async () => {
    const id = await returned();
    const [a, b] = await Promise.all([svc.settle(id, settleClean), svc.settle(id, settleClean)]);
    expect(a.paypal.captureIds).toEqual(b.paypal.captureIds);
    expect((await svc.getDeal(id)).paypal.captureIds).toHaveLength(1);
  });

  it('refuses to settle before the item is returned', async () => {
    const out = await handedOver();
    await expect(svc.settle(out.id, settleClean)).rejects.toMatchObject({ status: 409 });
  });
});

describe('settle: damage', () => {
  it('needs the owner; a contested deduction goes to CLAIMED and captures nothing', async () => {
    const id = await returned();
    await expect(
      svc.settle(id, { deductionCents: 4000, ownerOk: false, renterOk: true }),
    ).rejects.toMatchObject({ status: 400 });

    const claimed = await svc.settle(id, { deductionCents: 4000, ownerOk: true, renterOk: false });
    expect(claimed.state).toBe('CLAIMED');
    expect(claimed.paypal.captureIds).toEqual([]);
  });

  it('captures rent + deduction once both sides agree (CLAIMED -> SETTLED)', async () => {
    const id = await returned();
    await svc.settle(id, { deductionCents: 4000, ownerOk: true, renterOk: false });
    const deal = await svc.settle(id, { deductionCents: 2500, ownerOk: true, renterOk: true });
    expect(deal.state).toBe('SETTLED');
    expect(deal.paypal.captureIds).toHaveLength(1);
  });

  it('rejects a deduction above the deposit, or a fractional one', async () => {
    const id = await returned();
    await expect(svc.settle(id, { deductionCents: 15001, ownerOk: true, renterOk: true })).rejects.toMatchObject({ status: 400 });
    await expect(svc.settle(id, { deductionCents: 10.5, ownerOk: true, renterOk: true })).rejects.toMatchObject({ status: 400 });
  });

  it('never captures if the seller cannot be paid out', async () => {
    store = createMemoryDealStore({ 'listing-projector': { ownerId: 'maya', depositCents: 15000 } });
    svc = createDealService({ store, paypal, payeeMode: 'platform', now: () => clock });
    const deal = await held();
    await svc.handover(deal.id, signHandoverToken(deal.id), ['b.jpg'], 'maya');
    await svc.returnItem(deal.id, ['a.jpg'], 'leo');
    await expect(svc.settle(deal.id, settleClean)).rejects.toMatchObject({ status: 409 });
    expect((await svc.getDeal(deal.id)).paypal.captureIds).toEqual([]);
  });
});

describe('reauthorize', () => {
  const day = 86_400_000;

  it('does nothing in the first 3 days', async () => {
    const deal = await held();
    clock = new Date(clock.getTime() + 2 * day);
    expect(await svc.reauthorize(deal.id)).toEqual(deal);
  });

  it('refreshes the hold from day 3 and uses a stable request id per day', async () => {
    const calls: string[] = [];
    const spy: PayPalApi = {
      ...paypal,
      reauthorize: async (id, amount, requestId) => (calls.push(`${amount}:${requestId}`), { authorizationId: id }),
    };
    const s = createDealService({ store, paypal: spy, payeeMode: 'platform', now: () => clock });
    const deal = await held(s);
    clock = new Date(clock.getTime() + 4 * day);
    await s.reauthorize(deal.id);
    await s.reauthorize(deal.id);
    expect(calls).toEqual([`17800:${deal.id}:reauth-day-4`, `17800:${deal.id}:reauth-day-4`]);
  });

  it('refuses past the 29-day limit', async () => {
    const deal = await held();
    clock = new Date(clock.getTime() + 30 * day);
    await expect(svc.reauthorize(deal.id)).rejects.toMatchObject({ status: 409 });
  });
});
