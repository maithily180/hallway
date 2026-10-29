import { beforeEach, describe, expect, it } from 'vitest';
import { createMockPayPal } from '@/lib/paypal/mock';
import { requestId, toPayPalAmount } from '@/lib/paypal/money';

const paypal = createMockPayPal();
beforeEach(() => paypal.reset());

const urls = { returnUrl: 'r', cancelUrl: 'c' };

async function authorize(amountCents: number) {
  const { orderId } = await paypal.createOrder({
    requestId: 'o',
    intent: 'AUTHORIZE',
    amountCents,
    ...urls,
  });
  return (await paypal.authorizeOrder(orderId, 'a')).authorizationId;
}

const capture = (authorizationId: string, amountCents: number, finalCapture: boolean, rid: string) =>
  paypal.captureAuthorization({ authorizationId, amountCents, finalCapture, requestId: rid });

describe('money', () => {
  it('formats cents as PayPal strings', () => {
    expect(toPayPalAmount(2800)).toBe('28.00');
    expect(toPayPalAmount(5)).toBe('0.05');
  });
  it('rejects non-integer or negative cents', () => {
    expect(() => toPayPalAmount(12.5)).toThrow();
    expect(() => toPayPalAmount(-1)).toThrow();
  });
  it('derives request ids from deal and step', () => {
    expect(requestId('d1', 'capture')).toBe('d1:capture');
  });
});

describe('mock authorization', () => {
  it('final capture releases the rest of the deposit', async () => {
    const id = await authorize(17800);
    await capture(id, 2800, true, 'c1');
    await expect(capture(id, 100, false, 'c2')).rejects.toThrow();
  });

  it('cannot capture more than authorized', async () => {
    const id = await authorize(17800);
    await expect(capture(id, 17801, true, 'c1')).rejects.toThrow();
  });

  it('is idempotent on the same request id', async () => {
    const id = await authorize(17800);
    expect(await capture(id, 2800, false, 'same')).toEqual(await capture(id, 2800, false, 'same'));
  });

  it('cannot capture after void', async () => {
    const id = await authorize(17800);
    await paypal.voidAuthorization(id, 'v');
    await expect(capture(id, 100, true, 'c')).rejects.toThrow();
  });
});
