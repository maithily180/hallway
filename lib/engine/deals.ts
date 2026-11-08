import type { Deal, DealState, DealType, InspectionResult, Negotiation, PhotoUrl } from '@/lib/contracts';
import { signHandoverToken, verifyHandoverToken } from './handover-token';
import { requestId, type PayPalApi } from '@/lib/paypal';
import type { DealStore } from './store';
import { transition } from './transition';

export class DealError extends Error {
  override name = 'DealError';
  constructor(
    message: string,
    readonly status: 400 | 401 | 403 | 404 | 409,
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
  /** The Inspector (Chandrani's inspectCondition, or a mock). Proposes a deduction; never decides. */
  inspect?: InspectFn;
}

export type InspectFn = (args: {
  dealId: string;
  listingId: string;
  before: PhotoUrl[];
  after: PhotoUrl[];
}) => Promise<InspectionResult>;

const clamp = (n: number, min: number, max: number) => Math.min(Math.max(n, min), max);

const cleanInspection: InspectFn = async () => ({
  sameItem: true,
  newDamage: [],
  missingParts: [],
  confidence: 0.9,
  proposedDeductionCents: 0,
  summary: 'Same unit, no new damage.',
});

const DAY_MS = 86_400_000;
const NO_RETURN_GRACE_MS = DAY_MS; // the owner can claim a missing item 24 hours after the end date

export function createDealService(deps: DealServiceDeps) {
  const { store, paypal, now = () => new Date(), inspect = cleanInspection } = deps;
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

  function assertParticipant(deal: Deal, userId: string) {
    if (userId !== deal.buyerId && userId !== deal.sellerId) throw new DealError('not your deal', 403);
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

      // A rental agreed at $0 is a free loan: only the deposit is held, and it is released on return.
      const loan = n.kind === 'rent' && n.agreedCents === 0;
      if (loan && terms.depositCents <= 0) throw new DealError('a loan needs a deposit to hold', 409);
      const type: DealType = n.kind === 'sale' ? 'sale' : loan ? 'borrow' : 'rent';
      const days = n.kind === 'rent' ? (n.rentDays ?? 1) : 0;
      const start = now();
      return store.createDeal({
        listingId: n.listingId,
        buyerId: n.buyerId,
        sellerId: terms.ownerId,
        type,
        // Rent negotiates the nightly rate; the deal's amount is the total rent.
        amountCents: type === 'sale' ? n.agreedCents : n.agreedCents * days,
        depositCents: type === 'sale' ? 0 : terms.depositCents,
        start: type === 'sale' ? undefined : start.toISOString(),
        end: type === 'sale' ? undefined : new Date(start.getTime() + days * DAY_MS).toISOString(),
        state: 'AGREED',
        paypal: { captureIds: [] },
        timeline: [{ state: 'AGREED', at: start.toISOString() }],
      });
    },

    /** Only the buyer and the seller may read a deal (when a viewer is given). */
    async getDeal(id: string, viewerId?: string): Promise<Deal> {
      const deal = await mustGet(id);
      if (viewerId !== undefined) assertParticipant(deal, viewerId);
      return deal;
    },
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
          return payoutSeller(deal, deal.amountCents, captureId);
        }

        const { authorizationId } = await paypal.authorizeOrder(paypalOrderId, requestId(deal.id, 'authorize'));
        deal = move({ ...deal, paypal: { ...deal.paypal, authorizationId } }, 'HELD', authorizationId);
        return store.saveDeal(deal);
      });
    },

    /** Cancel: void a hold, refund a paid sale, or drop an unpaid deal. Nothing moves after pickup. */
    cancel(dealId: string, userId?: string): Promise<Deal> {
      return withLock(dealId, async () => {
        let deal = await mustGet(dealId);
        if (userId !== undefined) assertParticipant(deal, userId);
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

    /** The renter's QR token. Only the buyer may fetch it. */
    handoverToken(dealId: string, userId?: string): Promise<string> {
      return mustGet(dealId).then((deal) => {
        assertBuyer(deal, userId);
        return signHandoverToken(deal.id);
      });
    },

    /** Owner scans the renter's QR and records "before" photos: HELD -> OUT. */
    handover(dealId: string, qrToken: string, beforePhotos: PhotoUrl[], userId?: string): Promise<Deal> {
      return withLock(dealId, async () => {
        const deal = await mustGet(dealId);
        if (userId && userId !== deal.sellerId) throw new DealError('only the owner can confirm handover', 403);
        if (deal.state === 'OUT') return deal; // repeat scan
        if (deal.state !== 'HELD') throw new DealError(`cannot hand over a deal in ${deal.state}`, 409);
        if (!verifyHandoverToken(deal.id, qrToken)) throw new DealError('invalid handover code', 400);
        if (!beforePhotos.length) throw new DealError('before photos are required', 400);

        await store.saveInspection({ dealId: deal.id, beforePhotos, afterPhotos: [] });
        return store.saveDeal(move(deal, 'OUT'));
      });
    },

    /** Renter uploads "after" photos; the Inspector proposes a deduction. OUT -> RETURNED. */
    returnItem(
      dealId: string,
      afterPhotos: PhotoUrl[],
      userId?: string,
    ): Promise<{ deal: Deal; inspection: InspectionResult }> {
      return withLock(dealId, async () => {
        const deal = await mustGet(dealId);
        assertBuyer(deal, userId);
        const existing = await store.getInspection(deal.id);
        if (deal.state === 'RETURNED' && existing?.result) return { deal, inspection: existing.result };
        if (deal.state !== 'OUT' || !existing) throw new DealError(`cannot return a deal in ${deal.state}`, 409);
        if (!afterPhotos.length) throw new DealError('after photos are required', 400);

        const raw = await inspect({
          dealId: deal.id,
          listingId: deal.listingId,
          before: existing.beforePhotos,
          after: afterPhotos,
        });
        // The model only proposes; a deduction can never exceed the deposit.
        const inspection = { ...raw, proposedDeductionCents: clamp(raw.proposedDeductionCents, 0, deal.depositCents) };
        await store.saveInspection({ ...existing, afterPhotos, result: inspection });
        const next = await store.saveDeal(move(deal, 'RETURNED'));
        return { deal: await store.saveDeal({ ...next, inspectionId: deal.id }), inspection };
      });
    },

    /**
     * Capture what is owed with final_capture so PayPal releases the rest of the hold.
     * Clean return: rent only. Damage: rent + deduction, only if owner and renter both agree;
     * a contested deduction goes to CLAIMED for human review and captures nothing yet.
     */
    async settle(
      dealId: string,
      input: { deductionCents: number; ownerOk: boolean; renterOk: boolean },
      userId?: string,
    ): Promise<Deal> {
      // Internal callers (tests, the engine) pass no user and state both consents themselves.
      if (userId === undefined) return settleResolved(dealId, input);

      // From the API, each side may only speak for themselves: the owner proposes and confirms a
      // deduction, the renter accepts or disputes the owner's recorded figure. The other side's
      // consent is read from storage, never from the request body.
      const resolved = await withLock(dealId, async () => {
        const deal = await mustGet(dealId);
        const record = (await store.getInspection(deal.id)) ?? { dealId: deal.id, beforePhotos: [], afterPhotos: [] };

        if (userId === deal.sellerId) {
          const { deductionCents } = input;
          if (!Number.isInteger(deductionCents) || deductionCents < 0 || deductionCents > deal.depositCents) {
            throw new DealError('deduction must be between 0 and the deposit', 400);
          }
          const changed = record.deductionCents !== deductionCents;
          await store.saveInspection({
            ...record,
            deductionCents,
            ownerDecision: input.ownerOk ? 'ok' : 'dispute',
            renterDecision: changed ? undefined : record.renterDecision,
          });
          return {
            deductionCents,
            ownerOk: input.ownerOk,
            renterOk: deductionCents === 0 || (!changed && record.renterDecision === 'ok'),
          };
        }

        if (userId === deal.buyerId) {
          if (!record.deductionCents) throw new DealError('there is no deduction to respond to', 409);
          await store.saveInspection({ ...record, renterDecision: input.renterOk ? 'ok' : 'dispute' });
          return {
            deductionCents: record.deductionCents,
            ownerOk: record.ownerDecision === 'ok',
            renterOk: input.renterOk,
          };
        }
        throw new DealError('not your deal', 403);
      });
      return settleResolved(dealId, resolved);
    },

    /** The photos and findings for a deal, for the owner and the renter to review. */
    async getInspection(dealId: string, userId?: string) {
      const deal = await mustGet(dealId);
      if (userId !== undefined) assertParticipant(deal, userId);
      const record = await store.getInspection(deal.id);
      return record ? { ...record, depositCents: deal.depositCents } : null;
    },

    /**
     * The item never came back: once the rental is a day overdue the owner can claim the whole
     * hold (rent + deposit). OUT -> CLAIMED -> SETTLED, captured in one go.
     */
    claimNoReturn(dealId: string, userId: string): Promise<Deal> {
      return withLock(dealId, async () => {
        const deal = await mustGet(dealId);
        if (userId !== deal.sellerId) throw new DealError('only the owner can claim a missing item', 403);
        if (deal.state === 'SETTLED') return deal; // repeat is a no-op
        if (deal.state !== 'OUT') throw new DealError(`cannot claim a deal in ${deal.state}`, 409);
        if (!deal.paypal.authorizationId) throw new DealError('deal has no authorization', 409);
        if (!deal.end || now().getTime() < Date.parse(deal.end) + NO_RETURN_GRACE_MS) {
          throw new DealError('it is not overdue yet: you can claim 24 hours after the end date', 409);
        }

        await assertSellerPayable(deal);
        const total = deal.amountCents + deal.depositCents;
        const claimed = await store.saveDeal(move(deal, 'CLAIMED', deal.paypal.authorizationId));
        const { captureId } = await paypal.captureAuthorization({
          authorizationId: deal.paypal.authorizationId,
          amountCents: total,
          finalCapture: true,
          requestId: requestId(deal.id, 'capture-noreturn'),
        });
        const captured: Deal = {
          ...claimed,
          paypal: { ...claimed.paypal, captureIds: [...claimed.paypal.captureIds, captureId] },
        };
        return payoutSeller(captured, total, captureId);
      });
    },

    /**
     * The scheduled job: refresh every hold that has reached its third day. Safe to run often:
     * younger holds are skipped, and the PayPal request id is stable per deal per day.
     */
    async reauthorizeDue(): Promise<{ checked: number; refreshed: number; failed: string[] }> {
      const active = await store.listDeals({ states: ['HELD', 'OUT'] });
      let refreshed = 0;
      const failed: string[] = [];
      for (const deal of active) {
        const held = deal.timeline.find((t) => t.state === 'HELD');
        const days = held ? Math.floor((now().getTime() - Date.parse(held.at)) / DAY_MS) : 0;
        if (days < 3) continue;
        try {
          await this.reauthorize(deal.id);
          refreshed += 1;
        } catch (err) {
          failed.push(`${deal.id}: ${(err as Error).message}`);
        }
      }
      return { checked: active.length, refreshed, failed };
    },

    /**
     * Authorizations are only reliably capturable in the first 3 days. Long rentals refresh
     * the hold from day 3 on (allowed until day 29).
     */
    reauthorize(dealId: string): Promise<Deal> {
      return withLock(dealId, async () => {
        const deal = await mustGet(dealId);
        const held = deal.timeline.find((t) => t.state === 'HELD');
        if ((deal.state !== 'HELD' && deal.state !== 'OUT') || !deal.paypal.authorizationId || !held) {
          throw new DealError('no active authorization to refresh', 409);
        }
        const days = Math.floor((now().getTime() - Date.parse(held.at)) / DAY_MS);
        if (days < 3) return deal;
        if (days > 29) throw new DealError('authorization is past its 29-day limit', 409);

        const { authorizationId } = await paypal.reauthorize(
          deal.paypal.authorizationId,
          deal.amountCents + deal.depositCents,
          requestId(deal.id, `reauth-day-${days}`),
        );
        return store.saveDeal({ ...deal, paypal: { ...deal.paypal, authorizationId } });
      });
    },
  };

  /** Capture or claim, given both sides' consent. Locks per deal. */
  function settleResolved(
    dealId: string,
    input: { deductionCents: number; ownerOk: boolean; renterOk: boolean },
  ): Promise<Deal> {
    return withLock(dealId, async () => {
        const deal = await mustGet(dealId);
        if (deal.state === 'SETTLED') return deal; // repeat is a no-op
        if (deal.state !== 'RETURNED' && deal.state !== 'CLAIMED') {
          throw new DealError(`cannot settle a deal in ${deal.state}`, 409);
        }
        if (!deal.paypal.authorizationId) throw new DealError('deal has no authorization', 409);
        const { deductionCents } = input;
        if (!Number.isInteger(deductionCents) || deductionCents < 0 || deductionCents > deal.depositCents) {
          throw new DealError('deduction must be between 0 and the deposit', 400);
        }

        if (deductionCents > 0 && !(input.ownerOk && input.renterOk)) {
          if (!input.ownerOk) throw new DealError('owner must confirm a deduction', 400);
          return deal.state === 'CLAIMED' ? deal : store.saveDeal(move(deal, 'CLAIMED'));
        }

        const owedCents = deal.amountCents + deductionCents;
        if (owedCents === 0) {
          // A free loan returned clean: nothing is owed, so the whole deposit hold is released.
          await paypal.voidAuthorization(deal.paypal.authorizationId, requestId(deal.id, 'void-return'));
          const record = await store.getInspection(deal.id);
          if (record) await store.saveInspection({ ...record, ownerDecision: 'ok', renterDecision: 'ok' });
          return store.saveDeal(move(deal, 'SETTLED', deal.paypal.authorizationId));
        }
        await assertSellerPayable(deal);
        const { captureId } = await paypal.captureAuthorization({
          authorizationId: deal.paypal.authorizationId,
          amountCents: owedCents,
          finalCapture: true,
          requestId: requestId(deal.id, 'capture-final'),
        });
        const captured: Deal = {
          ...deal,
          paypal: { ...deal.paypal, captureIds: [...deal.paypal.captureIds, captureId] },
        };
        const inspection = await store.getInspection(deal.id);
        if (inspection) {
          await store.saveInspection({ ...inspection, ownerDecision: 'ok', renterDecision: 'ok' });
        }
        return payoutSeller(captured, owedCents, captureId);
    });
  }

  async function assertSellerPayable(deal: Deal) {
    if (payeeMode === 'direct') return;
    const terms = await store.getListingTerms(deal.listingId);
    if (!terms?.sellerPayoutEmail) throw new DealError('seller has no PayPal email for payout', 409);
  }

  /** Plan B: pay the seller from the platform balance. Plan A: the seller was already the payee. */
  async function payoutSeller(deal: Deal, amountCents: number, ref?: string): Promise<Deal> {
    if (payeeMode === 'direct') return store.saveDeal(move(deal, 'SETTLED', ref));
    const terms = await store.getListingTerms(deal.listingId);
    if (!terms?.sellerPayoutEmail) return store.saveDeal(deal); // sale stays PAID until the seller adds an email
    const { payoutBatchId } = await paypal.createPayout({
      batchId: requestId(deal.id, 'payout'),
      items: [{ receiver: terms.sellerPayoutEmail, amountCents }],
    });
    return store.saveDeal(move({ ...deal, paypal: { ...deal.paypal, payoutBatchId } }, 'SETTLED', payoutBatchId));
  }
}

export type DealService = ReturnType<typeof createDealService>;
