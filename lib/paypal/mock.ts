import { PayPalError, type PayPalApi } from './types';

type Auth = { remaining: number; voided: boolean; closed: boolean };

/** In-memory PayPal with the same behaviour as the sandbox for the calls we use. */
export function createMockPayPal(): PayPalApi & { reset(): void } {
  let n = 0;
  const id = (p: string) => `${p}-MOCK-${++n}`;
  const orders = new Map<string, { intent: string; amountCents: number }>();
  const auths = new Map<string, Auth>();
  const seen = new Map<string, unknown>();

  /** Same PayPal-Request-Id returns the original result, like the real API. */
  const once = <T>(requestId: string | undefined, fn: () => T): T => {
    if (requestId && seen.has(requestId)) return seen.get(requestId) as T;
    const result = fn();
    if (requestId) seen.set(requestId, result);
    return result;
  };

  return {
    reset() {
      n = 0;
      orders.clear();
      auths.clear();
      seen.clear();
    },
    async createOrder({ requestId, intent, amountCents }) {
      return once(requestId, () => {
        const orderId = id('ORDER');
        orders.set(orderId, { intent, amountCents });
        return { orderId, approveUrl: `https://sandbox.paypal.com/checkoutnow?token=${orderId}` };
      });
    },
    async captureOrder(orderId, requestId) {
      return once(requestId, () => {
        if (orders.get(orderId)?.intent !== 'CAPTURE') throw new PayPalError('bad order', 422);
        return { captureId: id('CAP') };
      });
    },
    async authorizeOrder(orderId, requestId) {
      return once(requestId, () => {
        const order = orders.get(orderId);
        if (order?.intent !== 'AUTHORIZE') throw new PayPalError('bad order', 422);
        const authorizationId = id('AUTH');
        auths.set(authorizationId, { remaining: order.amountCents, voided: false, closed: false });
        return { authorizationId };
      });
    },
    async captureAuthorization({ authorizationId, amountCents, finalCapture, requestId }) {
      return once(requestId, () => {
        const a = auths.get(authorizationId);
        if (!a || a.voided || a.closed) throw new PayPalError('authorization unavailable', 422);
        if (amountCents > a.remaining) throw new PayPalError('exceeds authorization', 422);
        a.remaining -= amountCents;
        if (finalCapture) a.closed = true; // remainder released
        return { captureId: id('CAP') };
      });
    },
    async voidAuthorization(authorizationId, requestId) {
      once(requestId, () => {
        const a = auths.get(authorizationId);
        if (!a || a.closed) throw new PayPalError('authorization unavailable', 422);
        a.voided = true;
      });
    },
    async reauthorize(authorizationId, _amountCents, requestId) {
      return once(requestId, () => {
        if (!auths.has(authorizationId)) throw new PayPalError('unknown authorization', 404);
        return { authorizationId };
      });
    },
    async refundCapture(_captureId, _amountCents, requestId) {
      return once(requestId, () => ({ refundId: id('REFUND') }));
    },
    async createPayout({ batchId }) {
      return once(batchId, () => ({ payoutBatchId: id('PAYOUT') }));
    },
    async verifyWebhook() {
      return true;
    },
  };
}
