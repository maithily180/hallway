import { beforeEach, describe, expect, it } from 'vitest';
import type { Negotiation } from '@/lib/contracts';
import { createDealService, type DealService } from '@/lib/engine/deals';
import { createMemoryDealStore } from '@/lib/engine/memory-store';
import { handlePayPalWebhook } from '@/lib/engine/webhooks';
import { createMockPayPal } from '@/lib/paypal/mock';

const paypal = createMockPayPal();
let store = createMemoryDealStore();
let svc: DealService;

const agreed = (over: Partial<Negotiation> = {}): Negotiation => ({
  id: 'n1',
  listingId: 'listing-projector',
  buyerId: 'leo',
  kind: 'rent',
  rentDays: 1,
  round: 3,
  status: 'agreed',
  agreedCents: 2800,
  ...over,
});

beforeEach(() => {
  paypal.reset();
  store = createMemoryDealStore();
  svc = createDealService({ store, paypal, payeeMode: 'platform' });
});

describe('sale (Plan B)', () => {
  it('pay -> approve captures and pays the seller out, ending SETTLED', async () => {
    const deal = await svc.createFromNegotiation(agreed({ kind: 'sale', agreedCents: 18000 }));
    expect(deal).toMatchObject({ type: 'sale', amountCents: 18000, depositCents: 0, state: 'AGREED' });

    const { paypalOrderId } = await svc.pay(deal.id, 'leo');
    const done = await svc.approve(deal.id, paypalOrderId, 'leo');

    expect(done.state).toBe('SETTLED');
    expect(done.paypal.captureIds).toHaveLength(1);
    expect(done.paypal.payoutBatchId).toBeTruthy();
    expect(done.timeline.map((t) => t.state)).toEqual(['AGREED', 'AWAITING_PAYMENT', 'PAID', 'SETTLED']);
  });

  it('is safe to double-click pay and approve', async () => {
    const deal = await svc.createFromNegotiation(agreed({ kind: 'sale', agreedCents: 18000 }));
    const [a, b] = await Promise.all([svc.pay(deal.id), svc.pay(deal.id)]);
    expect(a.paypalOrderId).toBe(b.paypalOrderId);

    const [x, y] = await Promise.all([
      svc.approve(deal.id, a.paypalOrderId),
      svc.approve(deal.id, a.paypalOrderId),
    ]);
    expect(x.paypal.captureIds).toEqual(y.paypal.captureIds);
    expect((await svc.getDeal(deal.id)).paypal.captureIds).toHaveLength(1);
  });

  it('refunds a sale that is only PAID (no seller email for payout)', async () => {
    store = createMemoryDealStore({ 'listing-projector': { ownerId: 'maya', depositCents: 0 } });
    svc = createDealService({ store, paypal, payeeMode: 'platform' });
    const deal = await svc.createFromNegotiation(agreed({ kind: 'sale', agreedCents: 18000 }));
    const { paypalOrderId } = await svc.pay(deal.id);
    expect((await svc.approve(deal.id, paypalOrderId)).state).toBe('PAID');
    expect((await svc.cancel(deal.id)).state).toBe('REFUNDED');
  });
});

describe('rent', () => {
  it('authorizes rent + deposit as one hold: $28 + $150', async () => {
    const deal = await svc.createFromNegotiation(agreed());
    expect(deal).toMatchObject({ type: 'rent', amountCents: 2800, depositCents: 15000 });

    const { paypalOrderId } = await svc.pay(deal.id, 'leo');
    const held = await svc.approve(deal.id, paypalOrderId, 'leo');
    expect(held.state).toBe('HELD');
    expect(held.paypal.authorizationId).toBeTruthy();
    expect(held.paypal.captureIds).toEqual([]); // nothing captured yet
  });

  it('multiplies the nightly rate by the number of days', async () => {
    const deal = await svc.createFromNegotiation(agreed({ rentDays: 3 }));
    expect(deal.amountCents).toBe(8400);
  });

  it('cancel before pickup voids the authorization', async () => {
    const deal = await svc.createFromNegotiation(agreed());
    const { paypalOrderId } = await svc.pay(deal.id);
    await svc.approve(deal.id, paypalOrderId);
    expect((await svc.cancel(deal.id)).state).toBe('VOIDED');
    expect((await svc.cancel(deal.id)).state).toBe('VOIDED'); // repeat is a no-op
  });
});

describe('guards', () => {
  it('only the buyer can pay or approve', async () => {
    const deal = await svc.createFromNegotiation(agreed());
    await expect(svc.pay(deal.id, 'maya')).rejects.toMatchObject({ status: 403 });
  });

  it('rejects an order id that does not belong to the deal', async () => {
    const deal = await svc.createFromNegotiation(agreed());
    await svc.pay(deal.id);
    await expect(svc.approve(deal.id, 'ORDER-OTHER')).rejects.toMatchObject({ status: 400 });
  });

  it('refuses to create a deal from a negotiation that is not agreed', async () => {
    await expect(svc.createFromNegotiation(agreed({ status: 'open' }))).rejects.toMatchObject({ status: 409 });
  });
});

describe('webhooks', () => {
  const send = (event: object) =>
    handlePayPalWebhook({ store, paypal }, {}, JSON.stringify(event));

  it('applies a confirmation once and ignores the replay', async () => {
    const deal = await svc.createFromNegotiation(agreed());
    const { paypalOrderId } = await svc.pay(deal.id);

    const event = {
      id: 'WH-1',
      event_type: 'PAYMENT.AUTHORIZATION.CREATED',
      resource: { id: 'AUTH-X', supplementary_data: { related_ids: { order_id: paypalOrderId } } },
    };
    expect(await send(event)).toMatchObject({ status: 'applied', state: 'HELD' });
    expect(await send(event)).toEqual({ status: 'duplicate' });
    expect((await svc.getDeal(deal.id)).timeline.filter((t) => t.state === 'HELD')).toHaveLength(1);
  });

  it('ignores illegal or out-of-order events instead of throwing', async () => {
    const deal = await svc.createFromNegotiation(agreed());
    const { paypalOrderId } = await svc.pay(deal.id);
    const res = await send({
      id: 'WH-2',
      event_type: 'PAYMENT.AUTHORIZATION.VOIDED',
      resource: { id: 'AUTH-X', supplementary_data: { related_ids: { order_id: paypalOrderId } } },
    });
    // AWAITING_PAYMENT -> VOIDED is legal; a second, different void then is a no-op duplicate state
    expect(res.status).toBe('applied');
    const again = await send({
      id: 'WH-3',
      event_type: 'PAYMENT.CAPTURE.REFUNDED',
      resource: { id: 'CAP-X', supplementary_data: { related_ids: { order_id: paypalOrderId } } },
    });
    expect(again).toMatchObject({ status: 'ignored' });
  });

  it('ignores events for unknown deals', async () => {
    expect(
      await send({ id: 'WH-4', event_type: 'PAYMENT.CAPTURE.COMPLETED', resource: { id: 'CAP-NOPE' } }),
    ).toMatchObject({ status: 'ignored' });
  });
});
