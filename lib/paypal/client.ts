import 'server-only';
import { PayPalError, type PayPalApi } from './types';
import { toPayPalAmount } from './money';

const BASES = {
  sandbox: 'https://api-m.sandbox.paypal.com',
  live: 'https://api-m.paypal.com',
} as const;

function config() {
  const env = process.env.PAYPAL_ENV === 'live' ? 'live' : 'sandbox';
  const id = process.env.PAYPAL_CLIENT_ID;
  const secret = process.env.PAYPAL_CLIENT_SECRET;
  if (!id || !secret) throw new Error('PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET not set');
  return { base: BASES[env], id, secret };
}

let cached: { token: string; expiresAt: number } | undefined;

async function accessToken(): Promise<string> {
  if (cached && cached.expiresAt > Date.now() + 30_000) return cached.token;
  const { base, id, secret } = config();
  const res = await fetch(`${base}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });
  const json = await res.json();
  if (!res.ok) throw new PayPalError('PayPal auth failed', res.status, json);
  cached = { token: json.access_token, expiresAt: Date.now() + json.expires_in * 1000 };
  return cached.token;
}

// PayPal responses are untyped JSON; callers pick out the fields they need.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function post<T = any>(path: string, body: unknown, requestId?: string): Promise<T> {
  const res = await fetch(`${config().base}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${await accessToken()}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
      ...(requestId ? { 'PayPal-Request-Id': requestId } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  const json = text ? JSON.parse(text) : {};
  if (!res.ok) throw new PayPalError(`PayPal ${path} failed`, res.status, json);
  return json as T;
}

const usd = (cents: number) => ({ currency_code: 'USD', value: toPayPalAmount(cents) });

export const realPayPal: PayPalApi = {
  async createOrder({ requestId, intent, amountCents, payeeEmail, returnUrl, cancelUrl }) {
    const order = await post(
      '/v2/checkout/orders',
      {
        intent,
        purchase_units: [
          {
            amount: usd(amountCents),
            ...(payeeEmail ? { payee: { email_address: payeeEmail } } : {}),
          },
        ],
        payment_source: {
          paypal: {
            experience_context: {
              return_url: returnUrl,
              cancel_url: cancelUrl,
              user_action: 'PAY_NOW',
            },
          },
        },
      },
      requestId,
    );
    const approveUrl = order.links?.find(
      (l: { rel: string }) => l.rel === 'payer-action' || l.rel === 'approve',
    )?.href;
    return { orderId: order.id, approveUrl };
  },

  async captureOrder(orderId, requestId) {
    const r = await post(`/v2/checkout/orders/${orderId}/capture`, undefined, requestId);
    return { captureId: r.purchase_units[0].payments.captures[0].id };
  },

  async authorizeOrder(orderId, requestId) {
    const r = await post(`/v2/checkout/orders/${orderId}/authorize`, undefined, requestId);
    return { authorizationId: r.purchase_units[0].payments.authorizations[0].id };
  },

  async captureAuthorization({ authorizationId, amountCents, finalCapture, requestId }) {
    const r = await post(
      `/v2/payments/authorizations/${authorizationId}/capture`,
      { amount: usd(amountCents), final_capture: finalCapture },
      requestId,
    );
    return { captureId: r.id };
  },

  async voidAuthorization(authorizationId, requestId) {
    await post(`/v2/payments/authorizations/${authorizationId}/void`, undefined, requestId);
  },

  async reauthorize(authorizationId, amountCents, requestId) {
    const r = await post(
      `/v2/payments/authorizations/${authorizationId}/reauthorize`,
      { amount: usd(amountCents) },
      requestId,
    );
    return { authorizationId: r.id };
  },

  async refundCapture(captureId, amountCents, requestId) {
    const r = await post(
      `/v2/payments/captures/${captureId}/refund`,
      amountCents === undefined ? {} : { amount: usd(amountCents) },
      requestId,
    );
    return { refundId: r.id };
  },

  async createPayout({ batchId, items }) {
    const r = await post('/v1/payments/payouts', {
      sender_batch_header: { sender_batch_id: batchId, email_subject: 'Hallway payout' },
      items: items.map((it, i) => ({
        recipient_type: 'EMAIL',
        receiver: it.receiver,
        amount: { currency: 'USD', value: toPayPalAmount(it.amountCents) },
        sender_item_id: `${batchId}-${i}`,
        ...(it.wallet === 'VENMO' ? { recipient_wallet: 'VENMO' } : {}),
      })),
    });
    return { payoutBatchId: r.batch_header.payout_batch_id };
  },

  async verifyWebhook(headers, rawBody) {
    const webhookId = process.env.PAYPAL_WEBHOOK_ID;
    if (!webhookId) throw new Error('PAYPAL_WEBHOOK_ID not set');
    const r = await post<{ verification_status: string }>(
      '/v1/notifications/verify-webhook-signature',
      {
        auth_algo: headers['paypal-auth-algo'],
        cert_url: headers['paypal-cert-url'],
        transmission_id: headers['paypal-transmission-id'],
        transmission_sig: headers['paypal-transmission-sig'],
        transmission_time: headers['paypal-transmission-time'],
        webhook_id: webhookId,
        webhook_event: JSON.parse(rawBody),
      },
    );
    return r.verification_status === 'SUCCESS';
  },
};
