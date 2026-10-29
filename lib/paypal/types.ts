import type { Cents } from '@/lib/contracts';

export type OrderIntent = 'CAPTURE' | 'AUTHORIZE';

export interface PayPalApi {
  createOrder(args: {
    requestId: string;
    intent: OrderIntent;
    amountCents: Cents;
    /** Plan A: pay a third-party seller directly. Omit for Plan B (platform receives). */
    payeeEmail?: string;
    returnUrl: string;
    cancelUrl: string;
  }): Promise<{ orderId: string; approveUrl?: string }>;
  captureOrder(orderId: string, requestId: string): Promise<{ captureId: string }>;
  authorizeOrder(orderId: string, requestId: string): Promise<{ authorizationId: string }>;
  captureAuthorization(args: {
    authorizationId: string;
    amountCents: Cents;
    /** true releases whatever remains of the authorization */
    finalCapture: boolean;
    requestId: string;
  }): Promise<{ captureId: string }>;
  voidAuthorization(authorizationId: string, requestId: string): Promise<void>;
  reauthorize(
    authorizationId: string,
    amountCents: Cents,
    requestId: string,
  ): Promise<{ authorizationId: string }>;
  refundCapture(
    captureId: string,
    amountCents: Cents | undefined,
    requestId: string,
  ): Promise<{ refundId: string }>;
  createPayout(args: {
    batchId: string;
    items: { receiver: string; amountCents: Cents; wallet?: 'PAYPAL' | 'VENMO' }[];
  }): Promise<{ payoutBatchId: string }>;
  verifyWebhook(headers: Record<string, string>, rawBody: string): Promise<boolean>;
}

export class PayPalError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly details?: unknown,
  ) {
    super(message);
  }
}
