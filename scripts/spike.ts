/**
 * PayPal sandbox spike: exercises every money call Hallway needs.
 *
 *   pnpm spike token|sale|rent|void|refund|payee|payout
 *
 * Buyer approval cannot be scripted: each order step prints an approve URL.
 * Open it, log in as Leo (sandbox personal), approve, then press Enter here.
 */
import { createInterface } from 'node:readline/promises';
import { randomUUID } from 'node:crypto';

const BASE = 'https://api-m.sandbox.paypal.com';
const { PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET, PAYPAL_PLATFORM_EMAIL, SANDBOX_MAYA_EMAIL } =
  process.env;

if (!PAYPAL_CLIENT_ID || !PAYPAL_CLIENT_SECRET) throw new Error('Set PAYPAL_CLIENT_* in .env');

const dollars = (cents: number) => (cents / 100).toFixed(2);

async function token(): Promise<string> {
  const basic = Buffer.from(`${PAYPAL_CLIENT_ID}:${PAYPAL_CLIENT_SECRET}`).toString('base64');
  const res = await fetch(`${BASE}/v1/oauth2/token`, {
    method: 'POST',
    headers: { Authorization: `Basic ${basic}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=client_credentials',
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`token failed: ${JSON.stringify(json)}`);
  return json.access_token;
}

async function call(path: string, body?: unknown, requestId: string = randomUUID()) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${await token()}`,
      'Content-Type': 'application/json',
      'PayPal-Request-Id': requestId,
      Prefer: 'return=representation',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  const json = text ? JSON.parse(text) : {};
  console.log(`  ${res.status} POST ${path}`);
  if (!res.ok) console.log('  ', JSON.stringify(json, null, 2));
  return { ok: res.ok, json };
}

async function waitForApproval(order: { id: string; links: { rel: string; href: string }[] }) {
  const url = order.links.find((l) => l.rel === 'payer-action' || l.rel === 'approve')?.href;
  console.log(`\n  Approve as Leo: ${url}`);
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  await rl.question('  Press Enter after approving... ');
  rl.close();
}

function orderBody(intent: 'CAPTURE' | 'AUTHORIZE', cents: number, payeeEmail?: string) {
  return {
    intent,
    purchase_units: [
      {
        amount: { currency_code: 'USD', value: dollars(cents) },
        ...(payeeEmail ? { payee: { email_address: payeeEmail } } : {}),
      },
    ],
    payment_source: {
      paypal: {
        experience_context: {
          return_url: 'https://example.com/return',
          cancel_url: 'https://example.com/cancel',
          user_action: 'PAY_NOW',
        },
      },
    },
  };
}

async function authorize(cents: number, payeeEmail?: string) {
  const created = await call('/v2/checkout/orders', orderBody('AUTHORIZE', cents, payeeEmail));
  if (!created.ok) return null;
  await waitForApproval(created.json);
  const auth = await call(`/v2/checkout/orders/${created.json.id}/authorize`);
  if (!auth.ok) return null;
  const authorizationId = auth.json.purchase_units[0].payments.authorizations[0].id;
  console.log(`  authorization ${authorizationId}`);
  return authorizationId as string;
}

const steps: Record<string, () => Promise<void>> = {
  async token() {
    console.log('  token ok:', (await token()).slice(0, 8) + '...');
  },

  // Sale: order CAPTURE, approve, capture.
  async sale() {
    const created = await call('/v2/checkout/orders', orderBody('CAPTURE', 2800));
    if (!created.ok) return;
    await waitForApproval(created.json);
    const cap = await call(`/v2/checkout/orders/${created.json.id}/capture`);
    console.log('  capture', cap.json?.purchase_units?.[0]?.payments?.captures?.[0]?.id);
  },

  // Rental: authorize $178 (rent 28 + deposit 150), capture $28 with final_capture, remainder released.
  async rent() {
    const authId = await authorize(17800);
    if (!authId) return;
    const cap = await call(`/v2/payments/authorizations/${authId}/capture`, {
      amount: { currency_code: 'USD', value: dollars(2800) },
      final_capture: true,
    });
    console.log('  captured', cap.json.id, cap.json.status);
    const check = await fetch(`${BASE}/v2/payments/authorizations/${authId}`, {
      headers: { Authorization: `Bearer ${await token()}` },
    });
    console.log('  authorization now:', (await check.json()).status, '(expect CAPTURED, remainder released)');
  },

  // Cancel before pickup.
  async void() {
    const authId = await authorize(17800);
    if (authId) await call(`/v2/payments/authorizations/${authId}/void`);
  },

  // Refund a sale capture.
  async refund() {
    const created = await call('/v2/checkout/orders', orderBody('CAPTURE', 2800));
    if (!created.ok) return;
    await waitForApproval(created.json);
    const cap = await call(`/v2/checkout/orders/${created.json.id}/capture`);
    const captureId = cap.json?.purchase_units?.[0]?.payments?.captures?.[0]?.id;
    if (captureId) await call(`/v2/payments/captures/${captureId}/refund`, {});
  },

  // Plan A check: AUTHORIZE with a third-party payee (Maya).
  async payee() {
    if (!SANDBOX_MAYA_EMAIL) throw new Error('Set SANDBOX_MAYA_EMAIL');
    const authId = await authorize(17800, SANDBOX_MAYA_EMAIL);
    console.log(authId ? '  PLAN A: payee works with AUTHORIZE' : '  PLAN B: payee refused');
  },

  // Plan B: pay Maya from the platform via Payouts (PayPal wallet).
  async payout() {
    if (!SANDBOX_MAYA_EMAIL) throw new Error('Set SANDBOX_MAYA_EMAIL');
    const batchId = `spike-${Date.now()}`;
    console.log(`  platform: ${PAYPAL_PLATFORM_EMAIL}`);
    await call('/v1/payments/payouts', {
      sender_batch_header: { sender_batch_id: batchId, email_subject: 'Hallway payout' },
      items: [
        {
          recipient_type: 'EMAIL',
          receiver: SANDBOX_MAYA_EMAIL,
          amount: { currency: 'USD', value: dollars(2800) },
          sender_item_id: `${batchId}-1`,
        },
      ],
    });
  },
};

async function main() {
  const name = process.argv[2] ?? 'token';
  const step = steps[name];
  if (!step) throw new Error(`unknown step "${name}"; use ${Object.keys(steps).join('|')}`);
  console.log(`spike: ${name}`);
  await step();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
