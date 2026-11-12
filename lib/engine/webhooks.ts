import type { Deal, DealState } from '@/lib/contracts';
import type { PayPalApi } from '@/lib/paypal';
import type { DealStore } from './store';
import { InvalidTransitionError, transition } from './transition';

export interface PayPalEvent {
  id: string;
  event_type: string;
  resource?: {
    id?: string;
    status?: string;
    supplementary_data?: { related_ids?: { order_id?: string; authorization_id?: string } };
    links?: { rel: string; href: string }[];
    batch_header?: { payout_batch_id?: string };
  };
}

export type WebhookOutcome =
  | { status: 'invalid-signature' }
  | { status: 'duplicate' }
  | { status: 'ignored'; reason: string }
  | { status: 'applied'; dealId: string; state: DealState };

/** The PayPal ids an event can be matched on. */
function refsOf(e: PayPalEvent) {
  const r = e.resource ?? {};
  const related = r.supplementary_data?.related_ids ?? {};
  const isCapture = e.event_type.startsWith('PAYMENT.CAPTURE');
  const isAuth = e.event_type.startsWith('PAYMENT.AUTHORIZATION');
  return {
    orderId: related.order_id ?? (e.event_type.startsWith('CHECKOUT.ORDER') ? r.id : undefined),
    authorizationId: related.authorization_id ?? (isAuth ? r.id : undefined),
    captureId: isCapture ? r.id : undefined,
    payoutBatchId: r.batch_header?.payout_batch_id,
  };
}

/** Which state an event asks for. The state machine decides whether it is legal. */
function targetState(deal: Deal, eventType: string): DealState | undefined {
  switch (eventType) {
    case 'PAYMENT.CAPTURE.COMPLETED':
      return deal.type === 'sale' ? 'PAID' : undefined; // rental captures are driven by /settle
    case 'PAYMENT.AUTHORIZATION.CREATED':
      return deal.type === 'sale' ? undefined : 'HELD';
    case 'PAYMENT.AUTHORIZATION.VOIDED':
      return 'VOIDED';
    case 'PAYMENT.CAPTURE.REFUNDED':
      return 'REFUNDED';
    case 'PAYMENT.PAYOUTSBATCH.SUCCESS':
      return 'SETTLED';
    default:
      return undefined;
  }
}

/**
 * Verify, dedupe, then move the deal through transition() only.
 * Illegal or out-of-order events are ignored, never thrown, so PayPal does not retry forever.
 */
export async function handlePayPalWebhook(
  deps: { store: DealStore; paypal: PayPalApi; now?: () => Date },
  headers: Record<string, string>,
  rawBody: string,
): Promise<WebhookOutcome> {
  const { store, paypal, now = () => new Date() } = deps;

  if (!(await paypal.verifyWebhook(headers, rawBody))) return { status: 'invalid-signature' };

  const event = JSON.parse(rawBody) as PayPalEvent;
  if (!(await store.recordWebhookEvent(event.id, event.event_type))) return { status: 'duplicate' };

  const refs = refsOf(event);
  const deal = await store.findDealByPayPalId(refs);
  if (!deal) return { status: 'ignored', reason: 'no matching deal' };

  const to = targetState(deal, event.event_type);
  if (!to) return { status: 'ignored', reason: `no action for ${event.event_type}` };

  try {
    const captureIds =
      refs.captureId && !deal.paypal.captureIds.includes(refs.captureId)
        ? [...deal.paypal.captureIds, refs.captureId]
        : deal.paypal.captureIds;
    const next = transition(
      { ...deal, paypal: { ...deal.paypal, captureIds } },
      to,
      now(),
      event.resource?.id,
    );
    await store.saveDeal(next);
    return { status: 'applied', dealId: next.id, state: next.state };
  } catch (err) {
    if (err instanceof InvalidTransitionError) {
      return { status: 'ignored', reason: err.message };
    }
    throw err;
  }
}
