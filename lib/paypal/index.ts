import type { PayPalApi } from './types';
import { createMockPayPal } from './mock';

export * from './types';
export * from './money';

let instance: PayPalApi | undefined;

/** Server-only. MOCK_PAYPAL=1 runs the whole app without keys. */
export async function getPayPal(): Promise<PayPalApi> {
  if (!instance) {
    instance =
      process.env.MOCK_PAYPAL === '1' ? createMockPayPal() : (await import('./client')).realPayPal;
  }
  return instance;
}
