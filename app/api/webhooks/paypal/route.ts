import { NextResponse } from 'next/server';
import { getDealStore } from '@/lib/engine/runtime';
import { handlePayPalWebhook } from '@/lib/engine/webhooks';
import { getPayPal } from '@/lib/paypal';

export async function POST(req: Request) {
  try {
    const rawBody = await req.text(); // signature is computed over the exact bytes
    const headers = Object.fromEntries([...req.headers].map(([k, v]) => [k.toLowerCase(), v]));
    const outcome = await handlePayPalWebhook(
      { store: await getDealStore(), paypal: await getPayPal() },
      headers,
      rawBody,
    );
    if (outcome.status === 'invalid-signature') {
      return NextResponse.json({ error: 'invalid signature' }, { status: 401 });
    }
    return NextResponse.json({ ok: true, outcome: outcome.status });
  } catch (err) {
    console.error('webhook error', err);
    // 500 makes PayPal retry, which is what we want for transient failures.
    return NextResponse.json({ error: 'webhook failed' }, { status: 500 });
  }
}
