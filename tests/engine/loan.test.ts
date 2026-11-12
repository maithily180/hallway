import { beforeEach, describe, expect, it } from 'vitest';
import type { InspectionResult, Negotiation } from '@/lib/contracts';
import { createDealService, type DealService, type InspectFn } from '@/lib/engine/deals';
import { signHandoverToken } from '@/lib/engine/handover-token';
import { createMemoryDealStore } from '@/lib/engine/memory-store';
import { canTransition } from '@/lib/engine/transition';
import type { PayPalApi } from '@/lib/paypal';
import { createMockPayPal } from '@/lib/paypal/mock';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const paypalMock = createMockPayPal();

/** The mock, with every call it receives recorded, so tests can check amounts and ids. */
function spied() {
  const calls: { fn: string; args: unknown[] }[] = [];
  const api = new Proxy(paypalMock as PayPalApi, {
    get(target, prop: string) {
      const v = (target as unknown as Record<string, unknown>)[prop];
      if (typeof v !== 'function' || prop === 'reset') return v;
      return (...args: unknown[]) => {
        calls.push({ fn: prop, args });
        return (v as (...a: unknown[]) => unknown)(...args);
      };
    },
  }) as PayPalApi & { reset(): void };
  return { api, calls };
}

let clock = new Date('2026-11-04T19:00:00Z');
let calls: ReturnType<typeof spied>['calls'];
let svc: DealService;
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

const TERMS = {
  rental: { ownerId: 'maya', depositCents: 15000, sellerPayoutEmail: 'maya@example.test' },
  loan: { ownerId: 'sam', depositCents: 6000, sellerPayoutEmail: 'sam@example.test' },
  nodeposit: { ownerId: 'sam', depositCents: 0, sellerPayoutEmail: 'sam@example.test' },
};

const negotiation = (listingId: string, over: Partial<Negotiation> = {}): Negotiation => ({
  id: 'n1',
  listingId,
  buyerId: 'leo',
  kind: 'rent',
  rentDays: 1,
  round: 0,
  status: 'agreed',
  agreedCents: 2800,
  ...over,
});

/** A deal driven to HELD, then optionally on to OUT / RETURNED. */
async function drive(listingId: 'rental' | 'loan', upTo: 'HELD' | 'OUT' | 'RETURNED', over: Partial<Negotiation> = {}) {
  const n = listingId === 'loan' ? negotiation('loan', { agreedCents: 0, ...over }) : negotiation('rental', over);
  const deal = await svc.createFromNegotiation(n);
  const { paypalOrderId } = await svc.pay(deal.id, 'leo');
  await svc.approve(deal.id, paypalOrderId, 'leo');
  if (upTo === 'HELD') return deal.id;
  await svc.handover(deal.id, signHandoverToken(deal.id), ['b.jpg'], deal.sellerId === 'sam' ? 'sam' : 'maya');
  if (upTo === 'OUT') return deal.id;
  await svc.returnItem(deal.id, ['a.jpg'], 'leo');
  return deal.id;
}

beforeEach(() => {
  paypalMock.reset();
  const s = spied();
  calls = s.calls;
  clock = new Date('2026-11-04T19:00:00Z');
  inspector = async () => result();
  svc = createDealService({
    store: createMemoryDealStore({ rental: TERMS.rental, loan: TERMS.loan, nodeposit: TERMS.nodeposit }),
    paypal: s.api,
    payeeMode: 'platform',
    now: () => clock,
    inspect: (a) => inspector(a),
  });
});

describe('free loan (borrow)', () => {
  it('is a deposit-only deal: $0 rent, deposit held, nothing else', async () => {
    const deal = await svc.createFromNegotiation(negotiation('loan', { agreedCents: 0, rentDays: 3 }));
    expect(deal).toMatchObject({ type: 'borrow', amountCents: 0, depositCents: 6000, sellerId: 'sam', state: 'AGREED' });
    expect(Date.parse(deal.end!) - Date.parse(deal.start!)).toBe(3 * DAY);

    await svc.pay(deal.id, 'leo');
    const order = calls.find((c) => c.fn === 'createOrder')!.args[0] as { intent: string; amountCents: number };
    expect(order).toMatchObject({ intent: 'AUTHORIZE', amountCents: 6000 }); // the deposit only
  });


  it('a clean return voids the hold: nothing captured, nothing paid out, state SETTLED', async () => {
    const id = await drive('loan', 'RETURNED');
    const done = await svc.settle(id, { deductionCents: 0, ownerOk: true, renterOk: false }, 'sam');
    expect(done.state).toBe('SETTLED');
    expect(done.paypal.captureIds).toEqual([]);
    expect(done.paypal.payoutBatchId).toBeUndefined();
    expect(calls.map((c) => c.fn)).toContain('voidAuthorization');
    expect(calls.map((c) => c.fn)).not.toContain('captureAuthorization');
    expect(done.timeline.map((t) => t.state).at(-1)).toBe('SETTLED');
  });

  it('settling twice is a no-op and never voids twice', async () => {
    const id = await drive('loan', 'RETURNED');
    await svc.settle(id, { deductionCents: 0, ownerOk: true, renterOk: false }, 'sam');
    await svc.settle(id, { deductionCents: 0, ownerOk: true, renterOk: false }, 'sam');
    expect(calls.filter((c) => c.fn === 'voidAuthorization')).toHaveLength(1);
  });

  it('damage: only the agreed deduction is captured and paid out; the rest of the deposit is released', async () => {
    inspector = async () => result({ proposedDeductionCents: 2500 });
    const id = await drive('loan', 'RETURNED');
    await svc.settle(id, { deductionCents: 2500, ownerOk: true, renterOk: false }, 'sam');
    const done = await svc.settle(id, { deductionCents: 0, ownerOk: false, renterOk: true }, 'leo');

    expect(done.state).toBe('SETTLED');
    const capture = calls.find((c) => c.fn === 'captureAuthorization')!.args[0] as { amountCents: number; finalCapture: boolean };
    expect(capture).toMatchObject({ amountCents: 2500, finalCapture: true });
    const payout = calls.find((c) => c.fn === 'createPayout')!.args[0] as { items: { amountCents: number }[] };
    expect(payout.items[0].amountCents).toBe(2500);
  });

  it('a cancelled loan voids the hold', async () => {
    const id = await drive('loan', 'HELD');
    expect((await svc.cancel(id, 'leo')).state).toBe('VOIDED');
  });
});

describe('free loan with no deposit', () => {
  const drive0 = async (upTo: 'AGREED' | 'HELD' | 'OUT' | 'RETURNED') => {
    const deal = await svc.createFromNegotiation(negotiation('nodeposit', { agreedCents: 0 }));
    if (upTo === 'AGREED') return deal.id;
    await svc.confirmLoan(deal.id, 'leo');
    if (upTo === 'HELD') return deal.id;
    await svc.handover(deal.id, signHandoverToken(deal.id), ['b.jpg'], 'sam');
    if (upTo === 'OUT') return deal.id;
    await svc.returnItem(deal.id, ['a.jpg'], 'leo');
    return deal.id;
  };

  it('has nothing to pay or hold: confirm goes straight to HELD with no PayPal call at all', async () => {
    const id = await drive0('HELD');
    const deal = await svc.getDeal(id);
    expect(deal).toMatchObject({ type: 'borrow', amountCents: 0, depositCents: 0, state: 'HELD' });
    expect(deal.timeline.map((t) => t.state)).toEqual(['AGREED', 'HELD']);
    expect(deal.paypal).toEqual({ captureIds: [] });
    expect(calls).toEqual([]);
  });

  it('runs hand over, return and settle without ever touching PayPal', async () => {
    const id = await drive0('RETURNED');
    const done = await svc.settle(id, { deductionCents: 0, ownerOk: true, renterOk: false }, 'sam');
    expect(done.state).toBe('SETTLED');
    expect(calls).toEqual([]);
    expect(done.paypal.payoutBatchId).toBeUndefined();
  });

  it('cannot carry a deduction, since there is no deposit to take it from', async () => {
    const id = await drive0('RETURNED');
    await expect(svc.settle(id, { deductionCents: 100, ownerOk: true, renterOk: false }, 'sam')).rejects.toMatchObject({ status: 400 });
  });

  it('only the borrower confirms, only once it is agreed, and repeating is harmless', async () => {
    const id = await drive0('AGREED');
    await expect(svc.confirmLoan(id, 'sam')).rejects.toMatchObject({ status: 403 });
    await expect(svc.confirmLoan(id, 'nobody')).rejects.toMatchObject({ status: 403 });
    expect((await svc.confirmLoan(id, 'leo')).state).toBe('HELD');
    expect((await svc.confirmLoan(id, 'leo')).state).toBe('HELD');
  });

  it('refuses to confirm anything that involves money', async () => {
    const withDeposit = await svc.createFromNegotiation(negotiation('loan', { agreedCents: 0 }));
    await expect(svc.confirmLoan(withDeposit.id, 'leo')).rejects.toMatchObject({ status: 409 });
    const rental = await svc.createFromNegotiation(negotiation('rental'));
    await expect(svc.confirmLoan(rental.id, 'leo')).rejects.toMatchObject({ status: 409 });
  });

  it('can be cancelled once confirmed, with nothing to void', async () => {
    const id = await drive0('HELD');
    expect((await svc.cancel(id, 'leo')).state).toBe('VOIDED');
    expect(calls).toEqual([]);
  });

  it('is skipped by the hold-refresh job and cannot be claimed as a no-show', async () => {
    const id = await drive0('OUT');
    clock = new Date(clock.getTime() + 40 * DAY);
    expect(await svc.reauthorizeDue()).toEqual({ checked: 1, refreshed: 0, failed: [] });
    await expect(svc.claimNoReturn(id, 'sam')).rejects.toMatchObject({ status: 409 });
  });

  it('is not allowed for rentals: AGREED -> HELD exists only for loans', () => {
    expect(canTransition('borrow', 'AGREED', 'HELD')).toBe(true);
    expect(canTransition('rent', 'AGREED', 'HELD')).toBe(false);
    expect(canTransition('sale', 'AGREED', 'HELD')).toBe(false);
  });
});

describe('item never returned', () => {
  it('the owner can claim the whole hold, but only a day after the end date', async () => {
    const id = await drive('rental', 'OUT');
    const deal = await svc.getDeal(id);

    clock = new Date(Date.parse(deal.end!) + 23 * HOUR); // not overdue enough
    await expect(svc.claimNoReturn(id, 'maya')).rejects.toMatchObject({ status: 409 });

    clock = new Date(Date.parse(deal.end!) + 25 * HOUR);
    const done = await svc.claimNoReturn(id, 'maya');
    expect(done.state).toBe('SETTLED');
    expect(done.timeline.map((t) => t.state)).toEqual(['AGREED', 'AWAITING_PAYMENT', 'HELD', 'OUT', 'CLAIMED', 'SETTLED']);

    const capture = calls.find((c) => c.fn === 'captureAuthorization')!.args[0] as { amountCents: number; finalCapture: boolean };
    expect(capture).toMatchObject({ amountCents: 17800, finalCapture: true }); // rent $28 + deposit $150
    const payout = calls.find((c) => c.fn === 'createPayout')!.args[0] as { items: { amountCents: number }[] };
    expect(payout.items[0].amountCents).toBe(17800);
  });

  it('only the owner can claim, and only while it is out', async () => {
    const id = await drive('rental', 'OUT');
    const deal = await svc.getDeal(id);
    clock = new Date(Date.parse(deal.end!) + 2 * DAY);
    await expect(svc.claimNoReturn(id, 'leo')).rejects.toMatchObject({ status: 403 });
    await expect(svc.claimNoReturn(id, 'sam')).rejects.toMatchObject({ status: 403 });

    const held = await drive('rental', 'HELD');
    await expect(svc.claimNoReturn(held, 'maya')).rejects.toMatchObject({ status: 409 });
  });

  it('is safe to repeat: one capture', async () => {
    const id = await drive('rental', 'OUT');
    clock = new Date(Date.parse((await svc.getDeal(id)).end!) + 2 * DAY);
    await svc.claimNoReturn(id, 'maya');
    await svc.claimNoReturn(id, 'maya');
    expect(calls.filter((c) => c.fn === 'captureAuthorization')).toHaveLength(1);
  });

  it('the state machine allows OUT -> CLAIMED but still not OUT -> VOIDED', () => {
    expect(canTransition('rent', 'OUT', 'CLAIMED')).toBe(true);
    expect(canTransition('rent', 'OUT', 'VOIDED')).toBe(false);
  });
});

describe('reauthorize job', () => {
  it('refreshes only the holds that have reached day 3', async () => {
    const old = await drive('rental', 'HELD'); // held at the start of the test clock
    clock = new Date(clock.getTime() + 2 * DAY);
    const young = await drive('rental', 'HELD'); // held two days later
    clock = new Date(clock.getTime() + 2 * DAY); // old is now 4 days in, young is 2 days in

    const summary = await svc.reauthorizeDue();
    expect(summary).toMatchObject({ checked: 2, refreshed: 1, failed: [] });
    const refreshed = calls.filter((c) => c.fn === 'reauthorize').map((c) => c.args[2]);
    expect(refreshed).toEqual([`${old}:reauth-day-4`]);
    expect(refreshed.join()).not.toContain(young);
  });

  it('reports a hold it cannot refresh instead of stopping', async () => {
    const id = await drive('rental', 'HELD');
    clock = new Date(clock.getTime() + 30 * DAY); // past the 29-day limit
    const summary = await svc.reauthorizeDue();
    expect(summary.refreshed).toBe(0);
    expect(summary.failed).toHaveLength(1);
    expect(summary.failed[0]).toContain(id);
  });

  it('ignores deals that are not holding money', async () => {
    await svc.createFromNegotiation(negotiation('rental')); // AGREED, never paid
    expect(await svc.reauthorizeDue()).toEqual({ checked: 0, refreshed: 0, failed: [] });
  });
});
