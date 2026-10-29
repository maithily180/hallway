import type { Deal, DealState, DealType, Negotiation } from '@/lib/contracts';
import { requestId, type PayPalApi } from '@/lib/paypal';
import type { DealStore } from './store';
import { transition } from './transition';

export class DealError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 403 | 404 | 409,
  ) {
    super(message);
  }
}

export interface DealServiceDeps {
  store: DealStore;
  paypal: PayPalApi;
  now?: () => Date;
  /** 'platform' (Plan B): Hallway receives, then pays the seller out. 'direct' (Plan A): seller is the order payee. */
  payeeMode?: 'platform' | 'direct';
  returnUrl?: string;
  cancelUrl?: string;
}

const DAY_MS = 86_400_000;

export function createDealService(deps: DealServiceDeps) {
  const { store, paypal, now = () => new Date() } = deps;
  const payeeMode = deps.payeeMode ?? (process.env.PAYEE_MODE === 'direct' ? 'direct' : 'platform');
  const returnUrl = deps.returnUrl ?? `${process.env.APP_URL ?? 'http://localhost:3000'}/deals`;
  const cancelUrl = deps.cancelUrl ?? returnUrl;

  // One in-flight action per deal per process; PayPal-Request-Id covers retries across processes.
  const locks = new Map<string, Promise<unknown>>();
  async function withLock<T>(dealId: string, fn: () => Promise<T>): Promise<T> {
    const prev = locks.get(dealId) ?? Promise.resolve();
    const run = prev.catch(() => undefined).then(fn);
    locks.set(dealId, run);
    try {
      return await run;
    } finally {
      if (locks.get(dealId) === run) locks.delete(dealId);
    }
  }

  async function mustGet(id: string): Promise<Deal> {
    const deal = await store.getDeal(id);
    if (!deal) throw new DealError('deal not found', 404);
    return deal;
  }

  function assertBuyer(deal: Deal, userId?: string) {
    if (userId && userId !== deal.buyerId) throw new DealError('only the buyer can do this', 403);
  }

  const move = (deal: Deal, to: DealState, ref?: string) => transition(deal, to, now(), ref);

  return {
    /** Called when a negotiation closes as agreed. Idempotent per negotiation via dealId. */
    async createFromNegotiation(n: Negotiation): Promise<Deal> {
      if (n.status !== 'agreed' || n.agreedCents === undefined) {
        throw new DealError('negotiation is not agreed', 409);
      }
      const terms = await store.getListingTerms(n.listingId);
      if (!terms) throw new DealError('listing not found', 404);

      const type: DealType = n.kind === 'rent' ? 'rent' : 'sale';
      const days = n.kind === 'rent' ? (n.rentDays ?? 1) : 0;
      const start = now();
      return store.createDeal({
        listingId: n.listingId,
        buyerId: n.buyerId,
        sellerId: terms.ownerId,
        type,
        // Rent negotiates the nightly rate; the deal's amount is the total rent.
        amountCents: type === 'rent' ? n.agreedCents * days : n.agreedCents,
        depositCents: type === 'rent' ? terms.depositCents : 0,
        start: type === 'rent' ? start.toISOString() : undefined,
        end: type === 'rent' ? new Date(start.getTime() + days * DAY_MS).toISOString() : undefined,
        state: 'AGREED',
        paypal: { captureIds: [] },
        timeline: [{ state: 'AGREED', at: start.toISOString() }],
      });
    },

    getDeal: mustGet,
    listDeals: (filter: Parameters<DealStore['listDeals']>[0]) => store.listDeals(filter),

    /** Create the PayPal order for the buyer to approve. Sale captures; rent authorizes rent + deposit. */
    pay(dealId: string, userId?: string): Promise<{ paypalOrderId: string; approveUrl?: string }> {
      return withLock(dealId, async () => {
        const deal = await mustGet(dealId);
        assertBuyer(deal, userId);
        if (deal.paypal.orderId) return { paypalOrderId: deal.paypal.orderId };
        if (deal.state !== 'AGREED') throw new DealError(`cannot pay a deal in ${deal.state}`, 409);

        const terms = await store.getListingTerms(deal.listingId);
        const order = await paypal.createOrder({
          requestId: requestId(deal.id, 'create-order'),
          intent: deal.type === 'sale' ? 'CAPTURE' : 'AUTHORIZE',
          amountCents: deal.amountCents + deal.depositCents,
          payeeEmail: payeeMode === 'direct' ? terms?.sellerPayoutEmail : undefined,
          returnUrl,
          cancelUrl,
        });
        const next = move({ ...deal, paypal: { ...deal.paypal, orderId: order.orderId } }, 'AWAITING_PAYMENT', order.orderId);
        await store.saveDeal(next);
        return { paypalOrderId: order.orderId, approveUrl: order.approveUrl };
      });
    },

    /** After the buyer approves in PayPal: capture a sale, or authorize a rental (HELD). */
    approve(dealId: string, paypalOrderId: string, userId?: string): Promise<Deal> {
      return withLock(dealId, async () => {
        let deal = await mustGet(dealId);
        assertBuyer(deal, userId);
        if (deal.paypal.orderId !== paypalOrderId) throw new DealError('order does not match this deal', 400);
        if (deal.state !== 'AWAITING_PAYMENT') return deal; // already processed: safe to repeat

        if (deal.type === 'sale') {
          const { captureId } = await paypal.captureOrder(paypalOrderId, requestId(deal.id, 'capture'));
          deal = move(
            { ...deal, paypal: { ...deal.paypal, captureIds: [...deal.paypal.captureIds, captureId] } },
            'PAID',
            captureId,
          );
          await store.saveDeal(deal);
          return payoutSeller(deal);
        }

        const { authorizationId } = await paypal.authorizeOrder(paypalOrderId, requestId(deal.id, 'authorize'));
        deal = move({ ...deal, paypal: { ...deal.paypal, authorizationId } }, 'HELD', authorizationId);
        return store.saveDeal(deal);
      });
    },

    /** Cancel: void a hold, refund a paid sale, or drop an unpaid deal. Nothing moves after pickup. */
    cancel(dealId: string): Promise<Deal> {
      return withLock(dealId, async () => {
        let deal = await mustGet(dealId);
        if (deal.state === 'HELD' && deal.paypal.authorizationId) {
          await paypal.voidAuthorization(deal.paypal.authorizationId, requestId(deal.id, 'void'));
          deal = move(deal, 'VOIDED', deal.paypal.authorizationId);
        } else if (deal.state === 'PAID' && deal.paypal.captureIds[0]) {
          const { refundId } = await paypal.refundCapture(deal.paypal.captureIds[0], undefined, requestId(deal.id, 'refund'));
          deal = move(deal, 'REFUNDED', refundId);
        } else if (deal.state === 'AGREED' || deal.state === 'AWAITING_PAYMENT') {
          deal = move(deal, 'VOIDED');
        } else if (deal.state === 'VOIDED' || deal.state === 'REFUNDED') {
          return deal;
        } else {
          throw new DealError(`cannot cancel a deal in ${deal.state}`, 409);
        }
        return store.saveDeal(deal);
      });
    },
  };

  /** Plan B: pay the seller from the platform balance. Plan A: the seller was already the payee. */
  async function payoutSeller(deal: Deal): Promise<Deal> {
    if (payeeMode === 'direct') return store.saveDeal(move(deal, 'SETTLED'));
    const terms = await store.getListingTerms(deal.listingId);
    if (!terms?.sellerPayoutEmail) return deal; // stays PAID; payout can be retried once the seller adds an email
    const { payoutBatchId } = await paypal.createPayout({
      batchId: requestId(deal.id, 'payout'),
      items: [{ receiver: terms.sellerPayoutEmail, amountCents: deal.amountCents }],
    });
    return store.saveDeal(move({ ...deal, paypal: { ...deal.paypal, payoutBatchId } }, 'SETTLED', payoutBatchId));
  }
}

export type DealService = ReturnType<typeof createDealService>;
