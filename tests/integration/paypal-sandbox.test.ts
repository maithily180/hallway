/**
 * Drives the real `lib/paypal/client.ts` against the PayPal sandbox. Opt-in, because it makes
 * network calls with your sandbox keys:
 *
 *   PAYPAL_SANDBOX_TESTS=1 node --env-file=.env node_modules/vitest/vitest.mjs run tests/integration/paypal-sandbox.test.ts
 *
 * The buyer side uses PayPal's published sandbox test card, so no PayPal login is needed. Only the
 * order is created with the card here; every capture, void, refund and payout goes through our client.
 */
import { describe, expect, it } from 'vitest';

const enabled = process.env.PAYPAL_SANDBOX_TESTS === '1' && !!process.env.PAYPAL_CLIENT_ID && !!process.env.PAYPAL_CLIENT_SECRET;
const BASE = 'https://api-m.sandbox.paypal.com';

async function token(): Promise<string> {
  const basic = Buffer.from(`${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`).toString('base64');
  const res = await fetch(`${BASE}/v1/oauth2/token`, {
    method: 'POST',
    headers: { Authorization: `Basic ${basic}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=client_credentials',
  });
  return (await res.json()).access_token;
}

/** A card order is authorized (or captured) as it is created: no buyer approval step. */
async function cardOrder(intent: 'AUTHORIZE' | 'CAPTURE', value: string) {
  const res = await fetch(`${BASE}/v2/checkout/orders`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${await token()}`,
      'Content-Type': 'application/json',
      'PayPal-Request-Id': `test-${Date.now()}-${Math.random()}`,
      Prefer: 'return=representation',
    },
    body: JSON.stringify({
      intent,
      purchase_units: [{ amount: { currency_code: 'USD', value } }],
      payment_source: {
        card: { name: 'Test Buyer', number: '4111111111111111', expiry: '2030-12', security_code: '123' },
      },
    }),
  });
  const json = await res.json();
  expect(res.status, JSON.stringify(json)).toBe(201);
  const payments = json.purchase_units[0].payments;
  return { authorizationId: payments.authorizations?.[0]?.id as string, captureId: payments.captures?.[0]?.id as string };
}

describe.skipIf(!enabled)('real PayPal sandbox through lib/paypal/client.ts', { timeout: 60_000 }, () => {
  it('rental: capture only the rent with final_capture; the rest of the hold is released', async () => {
    const { realPayPal } = await import('@/lib/paypal/client');
    const { authorizationId } = await cardOrder('AUTHORIZE', '178.00'); // $28 rent + $150 deposit

    const { captureId } = await realPayPal.captureAuthorization({
      authorizationId,
      amountCents: 2800,
      finalCapture: true,
      requestId: `t-final-${authorizationId}`,
    });
    expect(captureId).toBeTruthy();

    // The deposit is gone from the hold: nothing more can be captured on this authorization.
    await expect(
      realPayPal.captureAuthorization({ authorizationId, amountCents: 100, finalCapture: true, requestId: `t-extra-${authorizationId}` }),
    ).rejects.toMatchObject({ name: 'PayPalError', status: 422 });
  });

  it('is idempotent: the same request id never captures twice', async () => {
    const { realPayPal } = await import('@/lib/paypal/client');
    const { authorizationId } = await cardOrder('AUTHORIZE', '178.00');
    const args = { authorizationId, amountCents: 2800, finalCapture: false, requestId: `t-idem-${authorizationId}` };

    const first = await realPayPal.captureAuthorization(args);
    const second = await realPayPal.captureAuthorization(args); // a retried webhook or a double click
    expect(second.captureId).toBe(first.captureId);
  });

  it('cancel before pickup: voiding the authorization releases it, and it cannot be captured after', async () => {
    const { realPayPal } = await import('@/lib/paypal/client');
    const { authorizationId } = await cardOrder('AUTHORIZE', '178.00');

    await realPayPal.voidAuthorization(authorizationId, `t-void-${authorizationId}`);
    await expect(
      realPayPal.captureAuthorization({ authorizationId, amountCents: 2800, finalCapture: true, requestId: `t-late-${authorizationId}` }),
    ).rejects.toMatchObject({ name: 'PayPalError' });
  });

  it('sale: refund a captured payment', async () => {
    const { realPayPal } = await import('@/lib/paypal/client');
    const { captureId } = await cardOrder('CAPTURE', '28.00');

    const { refundId } = await realPayPal.refundCapture(captureId, undefined, `t-refund-${captureId}`);
    expect(refundId).toBeTruthy();
  });

  it('pays a seller out through Payouts', async () => {
    const { realPayPal } = await import('@/lib/paypal/client');
    const receiver = process.env.SANDBOX_MAYA_EMAIL;
    if (!receiver) return; // needs the seller's sandbox email
    const { payoutBatchId } = await realPayPal.createPayout({
      batchId: `t-payout-${Date.now()}`,
      items: [{ receiver, amountCents: 2800 }],
    });
    expect(payoutBatchId).toBeTruthy();
  });

  it('refuses an amount that is not whole cents, before any network call', async () => {
    const { realPayPal } = await import('@/lib/paypal/client');
    await expect(
      realPayPal.captureAuthorization({ authorizationId: 'X', amountCents: 28.5, finalCapture: true, requestId: 'r' }),
    ).rejects.toThrow(/Invalid cents/);
  });
});
