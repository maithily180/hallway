import { beforeEach, describe, expect, it } from 'vitest';
import type { Negotiation } from '@/lib/contracts';
import { createDealService, type DealService } from '@/lib/engine/deals';
import { signHandoverToken } from '@/lib/engine/handover-token';
import { createMemoryDealStore } from '@/lib/engine/memory-store';
import { PayPalError, type PayPalApi } from '@/lib/paypal';
import { createMockPayPal } from '@/lib/paypal/mock';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const paypalMock = createMockPayPal();

/** The mock with every call recorded, and an optional failure injected into one method. */
function spied(failOnce?: keyof PayPalApi) {
  const calls: { fn: string; args: unknown[] }[] = [];
  let failed = false;
  const api = new Proxy(paypalMock as PayPalApi, {
    get(target, prop: string) {
      const v = (target as unknown as Record<string, unknown>)[prop];
      if (typeof v !== 'function' || prop === 'reset') return v;
      return (...args: unknown[]) => {
        calls.push({ fn: prop, args });
        if (failOnce === prop && !failed) {
          failed = true;
          return Promise.reject(new PayPalError('injected failure', 503));
        }
        return (v as (...a: unknown[]) => unknown)(...args);
      };
    },
  }) as PayPalApi;
  return { api, calls };
}

let clock = new Date('2026-11-04T19:00:00Z');
const TERMS = {
  rental: { ownerId: 'maya', depositCents: 15000, sellerPayoutEmail: 'maya@example.test' },
  forsale: { ownerId: 'maya', depositCents: 0, sellerPayoutEmail: 'maya@example.test' },
  noemail: { ownerId: 'maya', depositCents: 0 },
  nodeposit: { ownerId: 'sam', depositCents: 0 },
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
const sale = (listingId = 'forsale') => negotiation(listingId, { kind: 'sale', agreedCents: 18000, rentDays: undefined });

function make(failOnce?: keyof PayPalApi) {
  paypalMock.reset();
  const s = spied(failOnce);
  const svc: DealService = createDealService({
    store: createMemoryDealStore(TERMS),
    paypal: s.api,
    payeeMode: 'platform',
    now: () => clock,
  });
  return { svc, calls: s.calls };
}

beforeEach(() => {
  clock = new Date('2026-11-04T19:00:00Z');
});

describe('an order the buyer never approved goes stale', () => {
  it('hands out the same order for a while, then issues a fresh one', async () => {
    const { svc, calls } = make();
    const deal = await svc.createFromNegotiation(sale());
    const first = await svc.pay(deal.id, 'leo');

    clock = new Date(clock.getTime() + HOUR); // still fresh
    expect((await svc.pay(deal.id, 'leo')).paypalOrderId).toBe(first.paypalOrderId);
    expect(calls.filter((c) => c.fn === 'createOrder')).toHaveLength(1);

    clock = new Date(clock.getTime() + 3 * HOUR); // 4h after: PayPal has likely expired it
    const second = await svc.pay(deal.id, 'leo');
    expect(second.paypalOrderId).not.toBe(first.paypalOrderId);
    expect(calls.filter((c) => c.fn === 'createOrder')).toHaveLength(2);
  });

  it('the old order can no longer be approved; the new one can', async () => {
    const { svc } = make();
    const deal = await svc.createFromNegotiation(sale());
    const old = await svc.pay(deal.id, 'leo');
    clock = new Date(clock.getTime() + 5 * HOUR);
    const fresh = await svc.pay(deal.id, 'leo');

    await expect(svc.approve(deal.id, old.paypalOrderId, 'leo')).rejects.toMatchObject({ status: 400 });
    const done = await svc.approve(deal.id, fresh.paypalOrderId, 'leo');
    expect(done.state).toBe('SETTLED');
    expect(done.paypal.captureIds).toHaveLength(1);
  });

  it('a double click after the refresh still creates just one new order', async () => {
    const { svc, calls } = make();
    const deal = await svc.createFromNegotiation(sale());
    await svc.pay(deal.id, 'leo');
    clock = new Date(clock.getTime() + 5 * HOUR);
    const [a, b, c] = await Promise.all([svc.pay(deal.id, 'leo'), svc.pay(deal.id, 'leo'), svc.pay(deal.id, 'leo')]);
    expect(a.paypalOrderId).toBe(b.paypalOrderId);
    expect(b.paypalOrderId).toBe(c.paypalOrderId);
    expect(calls.filter((x) => x.fn === 'createOrder')).toHaveLength(2); // the original and one replacement
  });

  it('records the replacement on the timeline without changing state', async () => {
    const { svc } = make();
    const deal = await svc.createFromNegotiation(sale());
    await svc.pay(deal.id, 'leo');
    clock = new Date(clock.getTime() + 5 * HOUR);
    const fresh = await svc.pay(deal.id, 'leo');
    const after = await svc.getDeal(deal.id);
    expect(after.state).toBe('AWAITING_PAYMENT');
    expect(after.timeline.at(-1)).toMatchObject({ state: 'AWAITING_PAYMENT', paypalRef: fresh.paypalOrderId });
  });

  it('never refreshes once the deal has moved on', async () => {
    const { svc, calls } = make();
    const deal = await svc.createFromNegotiation(negotiation('rental'));
    const { paypalOrderId } = await svc.pay(deal.id, 'leo');
    await svc.approve(deal.id, paypalOrderId, 'leo'); // HELD
    clock = new Date(clock.getTime() + 10 * HOUR);
    expect((await svc.pay(deal.id, 'leo')).paypalOrderId).toBe(paypalOrderId);
    expect(calls.filter((c) => c.fn === 'createOrder')).toHaveLength(1);
  });
});

describe('a payout that fails after the capture is finished later', () => {
  it('the sale is captured and kept as PAID; the retry pays the seller once', async () => {
    const { svc, calls } = make('createPayout');
    const deal = await svc.createFromNegotiation(sale());
    const { paypalOrderId } = await svc.pay(deal.id, 'leo');

    await expect(svc.approve(deal.id, paypalOrderId, 'leo')).rejects.toMatchObject({ name: 'PayPalError' });
    const stuck = await svc.getDeal(deal.id);
    expect(stuck.state).toBe('PAID');
    expect(stuck.paypal.captureIds).toHaveLength(1); // the money was taken and is recorded

    const first = await svc.retryPendingPayouts();
    expect(first).toEqual({ checked: 1, settled: 1, failed: [] });
    const done = await svc.getDeal(deal.id);
    expect(done.state).toBe('SETTLED');
    expect(done.paypal.payoutBatchId).toBeTruthy();

    expect(await svc.retryPendingPayouts()).toEqual({ checked: 0, settled: 0, failed: [] }); // nothing left
    expect(calls.filter((c) => c.fn === 'captureOrder')).toHaveLength(1); // never captured twice
  });

  it('a seller with no PayPal email keeps the sale in PAID without erroring, until they add one', async () => {
    const { svc } = make();
    const deal = await svc.createFromNegotiation(sale('noemail'));
    const { paypalOrderId } = await svc.pay(deal.id, 'leo');
    expect((await svc.approve(deal.id, paypalOrderId, 'leo')).state).toBe('PAID');
    expect(await svc.retryPendingPayouts()).toEqual({ checked: 1, settled: 0, failed: [] });
  });

  it('reports a payout that keeps failing instead of stopping the whole run', async () => {
    paypalMock.reset();
    const alwaysFail = { ...paypalMock, createPayout: () => Promise.reject(new PayPalError('down', 503)) } as PayPalApi;
    const svc = createDealService({ store: createMemoryDealStore(TERMS), paypal: alwaysFail, payeeMode: 'platform', now: () => clock });
    const deal = await svc.createFromNegotiation(sale());
    const { paypalOrderId } = await svc.pay(deal.id, 'leo');
    await svc.approve(deal.id, paypalOrderId, 'leo').catch(() => undefined);
    const run = await svc.retryPendingPayouts();
    expect(run.settled).toBe(0);
    expect(run.failed).toHaveLength(1);
    expect(run.failed[0]).toContain(deal.id);
  });
});

describe('ten clicks at once never act twice', () => {
  const ten = <T>(fn: () => Promise<T>) => Promise.allSettled(Array.from({ length: 10 }, fn));

  it('pay: one order', async () => {
    const { svc, calls } = make();
    const deal = await svc.createFromNegotiation(negotiation('rental'));
    const results = await ten(() => svc.pay(deal.id, 'leo'));
    expect(new Set(results.map((r) => (r.status === 'fulfilled' ? r.value.paypalOrderId : 'x'))).size).toBe(1);
    expect(calls.filter((c) => c.fn === 'createOrder')).toHaveLength(1);
  });

  it('approve a sale: one capture and one payout', async () => {
    const { svc, calls } = make();
    const deal = await svc.createFromNegotiation(sale());
    const { paypalOrderId } = await svc.pay(deal.id, 'leo');
    await ten(() => svc.approve(deal.id, paypalOrderId, 'leo'));
    expect(calls.filter((c) => c.fn === 'captureOrder')).toHaveLength(1);
    expect(calls.filter((c) => c.fn === 'createPayout')).toHaveLength(1);
    expect((await svc.getDeal(deal.id)).paypal.captureIds).toHaveLength(1);
  });

  it('approve a rental: one authorization', async () => {
    const { svc, calls } = make();
    const deal = await svc.createFromNegotiation(negotiation('rental'));
    const { paypalOrderId } = await svc.pay(deal.id, 'leo');
    await ten(() => svc.approve(deal.id, paypalOrderId, 'leo'));
    expect(calls.filter((c) => c.fn === 'authorizeOrder')).toHaveLength(1);
  });

  it('settle a rental: one final capture and one payout', async () => {
    const { svc, calls } = make();
    const deal = await svc.createFromNegotiation(negotiation('rental'));
    const { paypalOrderId } = await svc.pay(deal.id, 'leo');
    await svc.approve(deal.id, paypalOrderId, 'leo');
    await svc.handover(deal.id, signHandoverToken(deal.id), ['b.jpg'], 'maya');
    await svc.returnItem(deal.id, ['a.jpg'], 'leo');
    await ten(() => svc.settle(deal.id, { deductionCents: 0, ownerOk: true, renterOk: false }, 'maya'));
    expect(calls.filter((c) => c.fn === 'captureAuthorization')).toHaveLength(1);
    expect(calls.filter((c) => c.fn === 'createPayout')).toHaveLength(1);
    expect((await svc.getDeal(deal.id)).state).toBe('SETTLED');
  });

  it('claim a missing item: one capture of the whole hold', async () => {
    const { svc, calls } = make();
    const deal = await svc.createFromNegotiation(negotiation('rental'));
    const { paypalOrderId } = await svc.pay(deal.id, 'leo');
    await svc.approve(deal.id, paypalOrderId, 'leo');
    await svc.handover(deal.id, signHandoverToken(deal.id), ['b.jpg'], 'maya');
    clock = new Date(Date.parse((await svc.getDeal(deal.id)).end!) + 2 * DAY);
    await ten(() => svc.claimNoReturn(deal.id, 'maya'));
    expect(calls.filter((c) => c.fn === 'captureAuthorization')).toHaveLength(1);
  });

  it('cancel a held rental: one void', async () => {
    const { svc, calls } = make();
    const deal = await svc.createFromNegotiation(negotiation('rental'));
    const { paypalOrderId } = await svc.pay(deal.id, 'leo');
    await svc.approve(deal.id, paypalOrderId, 'leo');
    await ten(() => svc.cancel(deal.id, 'leo'));
    expect(calls.filter((c) => c.fn === 'voidAuthorization')).toHaveLength(1);
  });
});
