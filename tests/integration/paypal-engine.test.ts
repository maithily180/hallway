/**
 * The real deal engine on the real PayPal sandbox, end to end. Opt-in (network + your sandbox keys):
 *
 *   PAYPAL_SANDBOX_TESTS=1 node --env-file=.env node_modules/vitest/vitest.mjs run tests/integration/paypal-engine.test.ts
 *
 * Only the buyer's payment step differs from production: instead of the PayPal login popup, the
 * order is paid with PayPal's published sandbox test card, which authorizes (or captures) as the
 * order is created. Everything else is the production code path: our client, the deal engine,
 * partial capture with final_capture, void, refund and Payouts. We then ask PayPal itself what
 * happened, instead of trusting our own records.
 */
import { describe, expect, it } from 'vitest';
import { createDealService, type DealService } from '@/lib/engine/deals';
import { signHandoverToken } from '@/lib/engine/handover-token';
import { createMemoryDealStore } from '@/lib/engine/memory-store';
import type { PayPalApi } from '@/lib/paypal';

const enabled =
  process.env.PAYPAL_SANDBOX_TESTS === '1' && !!process.env.PAYPAL_CLIENT_ID && !!process.env.PAYPAL_CLIENT_SECRET;
const BASE = 'https://api-m.sandbox.paypal.com';
const MAYA = process.env.SANDBOX_MAYA_EMAIL ?? 'sb-maya@example.test';
const DAY = 86_400_000;

async function token(): Promise<string> {
  const basic = Buffer.from(`${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`).toString('base64');
  const res = await fetch(`${BASE}/v1/oauth2/token`, {
    method: 'POST',
    headers: { Authorization: `Basic ${basic}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=client_credentials',
  });
  return (await res.json()).access_token;
}

async function get(path: string) {
  const res = await fetch(`${BASE}${path}`, { headers: { Authorization: `Bearer ${await token()}` } });
  return res.json();
}

/** The production client, except the buyer pays with the sandbox test card (no login popup). */
async function cardPayPal(): Promise<PayPalApi> {
  const { realPayPal } = await import('@/lib/paypal/client');
  const created = new Map<string, { authorizationId?: string; captureId?: string }>();

  return {
    ...realPayPal,
    async createOrder({ requestId, intent, amountCents }) {
      const res = await fetch(`${BASE}/v2/checkout/orders`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${await token()}`,
          'Content-Type': 'application/json',
          'PayPal-Request-Id': requestId,
          Prefer: 'return=representation',
        },
        body: JSON.stringify({
          intent,
          purchase_units: [{ amount: { currency_code: 'USD', value: (amountCents / 100).toFixed(2) } }],
          payment_source: {
            card: { name: 'Test Buyer', number: '4111111111111111', expiry: '2030-12', security_code: '123' },
          },
        }),
      });
      const json = await res.json();
      expect(res.status, JSON.stringify(json)).toBe(201);
      const pay = json.purchase_units[0].payments;
      created.set(json.id, { authorizationId: pay.authorizations?.[0]?.id, captureId: pay.captures?.[0]?.id });
      return { orderId: json.id };
    },
    // A card order is already authorized / captured when it is created.
    async authorizeOrder(orderId) {
      return { authorizationId: created.get(orderId)!.authorizationId! };
    },
    async captureOrder(orderId) {
      return { captureId: created.get(orderId)!.captureId! };
    },
  };
}

describe.skipIf(!enabled)('deal engine on the real PayPal sandbox', { timeout: 120_000 }, () => {
  let clock = new Date();
  let svc: DealService;

  async function setup() {
    clock = new Date();
    svc = createDealService({
      store: createMemoryDealStore({
        rental: { ownerId: 'maya', depositCents: 15000, sellerPayoutEmail: MAYA },
        loan: { ownerId: 'maya', depositCents: 6000, sellerPayoutEmail: MAYA },
        forsale: { ownerId: 'maya', depositCents: 0, sellerPayoutEmail: MAYA },
      }),
      paypal: await cardPayPal(),
      payeeMode: 'platform',
      now: () => clock,
    });
  }

  const negotiation = (listingId: string, over: Record<string, unknown> = {}) => ({
    id: 'n1',
    listingId,
    buyerId: 'leo',
    kind: 'rent' as const,
    rentDays: 1,
    round: 3,
    status: 'agreed' as const,
    agreedCents: 2800,
    ...over,
  });

  /** HELD -> OUT -> RETURNED. */
  async function toReturned(listingId: 'rental' | 'loan', over: Record<string, unknown> = {}) {
    const deal = await svc.createFromNegotiation(negotiation(listingId, listingId === 'loan' ? { agreedCents: 0, ...over } : over));
    const { paypalOrderId } = await svc.pay(deal.id, 'leo');
    const held = await svc.approve(deal.id, paypalOrderId, 'leo');
    expect(held.state).toBe('HELD');
    await svc.handover(deal.id, signHandoverToken(deal.id), ['before.jpg'], 'maya');
    await svc.returnItem(deal.id, ['after.jpg'], 'leo');
    return deal.id;
  }

  it('rental, clean return: $28 captured, the $150 deposit released, the seller paid out', async () => {
    await setup();
    const id = await toReturned('rental');
    const held = await svc.getDeal(id);
    const authBefore = await get(`/v2/payments/authorizations/${held.paypal.authorizationId}`);
    expect(authBefore).toMatchObject({ status: 'CREATED', amount: { value: '178.00' } }); // rent + deposit, one hold

    const done = await svc.settle(id, { deductionCents: 0, ownerOk: true, renterOk: false }, 'maya');
    expect(done.state).toBe('SETTLED');

    // Ask PayPal, not our own records.
    const capture = await get(`/v2/payments/captures/${done.paypal.captureIds[0]}`);
    expect(capture).toMatchObject({ status: 'COMPLETED', amount: { value: '28.00', currency_code: 'USD' }, final_capture: true });
    const auth = await get(`/v2/payments/authorizations/${held.paypal.authorizationId}`);
    expect(auth.status).toBe('CAPTURED'); // closed: the remaining $150 is released
    const payout = await get(`/v1/payments/payouts/${done.paypal.payoutBatchId}`);
    expect(['SUCCESS', 'PENDING', 'PROCESSING']).toContain(payout.batch_header.batch_status);
    expect(payout.batch_header.amount).toMatchObject({ value: '28.00' });
  });

  it('rental, damage both sides agree on: rent + the $40 deduction captured', async () => {
    await setup();
    const id = await toReturned('rental');
    await svc.settle(id, { deductionCents: 4000, ownerOk: true, renterOk: false }, 'maya'); // owner proposes -> CLAIMED
    expect((await svc.getDeal(id)).state).toBe('CLAIMED');
    const done = await svc.settle(id, { deductionCents: 0, ownerOk: false, renterOk: true }, 'leo'); // renter accepts that figure
    expect(done.state).toBe('SETTLED');
    const capture = await get(`/v2/payments/captures/${done.paypal.captureIds[0]}`);
    expect(capture).toMatchObject({ status: 'COMPLETED', amount: { value: '68.00' } });
  });

  it('rental, never returned: the owner claims the whole $178 hold a day after the end date', async () => {
    await setup();
    const deal = await svc.createFromNegotiation(negotiation('rental'));
    const { paypalOrderId } = await svc.pay(deal.id, 'leo');
    await svc.approve(deal.id, paypalOrderId, 'leo');
    await svc.handover(deal.id, signHandoverToken(deal.id), ['before.jpg'], 'maya');

    clock = new Date(Date.parse((await svc.getDeal(deal.id)).end!) + 2 * DAY);
    const done = await svc.claimNoReturn(deal.id, 'maya');
    expect(done.state).toBe('SETTLED');
    expect(await get(`/v2/payments/captures/${done.paypal.captureIds[0]}`)).toMatchObject({
      status: 'COMPLETED',
      amount: { value: '178.00' },
    });
  });

  it('free loan with a deposit: a clean return VOIDS the $60 hold, so nothing is charged', async () => {
    await setup();
    const id = await toReturned('loan');
    const held = await svc.getDeal(id);
    expect(await get(`/v2/payments/authorizations/${held.paypal.authorizationId}`)).toMatchObject({
      status: 'CREATED',
      amount: { value: '60.00' },
    });

    const done = await svc.settle(id, { deductionCents: 0, ownerOk: true, renterOk: false }, 'maya');
    expect(done).toMatchObject({ state: 'SETTLED', type: 'borrow' });
    expect(done.paypal.captureIds).toEqual([]);
    expect((await get(`/v2/payments/authorizations/${held.paypal.authorizationId}`)).status).toBe('VOIDED');
  });

  it('cancel before pickup: the hold is voided on PayPal', async () => {
    await setup();
    const deal = await svc.createFromNegotiation(negotiation('rental'));
    const { paypalOrderId } = await svc.pay(deal.id, 'leo');
    const held = await svc.approve(deal.id, paypalOrderId, 'leo');
    const cancelled = await svc.cancel(deal.id, 'leo');
    expect(cancelled.state).toBe('VOIDED');
    expect((await get(`/v2/payments/authorizations/${held.paypal.authorizationId}`)).status).toBe('VOIDED');
  });

  it('sale: captured $180 and the seller paid out; a second sale is refunded', async () => {
    await setup();
    const sale = (id: string) => negotiation(id, { kind: 'sale', agreedCents: 18000, rentDays: undefined });

    const a = await svc.createFromNegotiation(sale('forsale'));
    const { paypalOrderId } = await svc.pay(a.id, 'leo');
    const paid = await svc.approve(a.id, paypalOrderId, 'leo');
    expect(paid.state).toBe('SETTLED');
    expect(await get(`/v2/payments/captures/${paid.paypal.captureIds[0]}`)).toMatchObject({
      status: 'COMPLETED',
      amount: { value: '180.00' },
    });
    expect(['SUCCESS', 'PENDING', 'PROCESSING']).toContain(
      (await get(`/v1/payments/payouts/${paid.paypal.payoutBatchId}`)).batch_header.batch_status,
    );

    // refund path: a sale whose seller cannot be paid out yet stays PAID, then is refunded
    const noPayout = createDealService({
      store: createMemoryDealStore({ forsale: { ownerId: 'maya', depositCents: 0 } }),
      paypal: await cardPayPal(),
      payeeMode: 'platform',
    });
    const b = await noPayout.createFromNegotiation(sale('forsale'));
    const order = await noPayout.pay(b.id, 'leo');
    expect((await noPayout.approve(b.id, order.paypalOrderId, 'leo')).state).toBe('PAID');
    const refunded = await noPayout.cancel(b.id, 'leo');
    expect(refunded.state).toBe('REFUNDED');
  });

  it('a double-click on settle against real PayPal captures once', async () => {
    await setup();
    const id = await toReturned('rental');
    const results = await Promise.all(
      Array.from({ length: 5 }, () => svc.settle(id, { deductionCents: 0, ownerOk: true, renterOk: false }, 'maya')),
    );
    expect(new Set(results.map((d) => d.paypal.captureIds.join())).size).toBe(1);
    expect((await svc.getDeal(id)).paypal.captureIds).toHaveLength(1);
  });
});
