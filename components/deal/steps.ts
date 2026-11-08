import type { Deal, DealState } from '@/lib/contracts';
import { usd } from './format';

export interface Step {
  state: DealState;
  title: string;
  detail: string;
}

const SALE: DealState[] = ['AGREED', 'AWAITING_PAYMENT', 'PAID', 'SETTLED'];
const RENT: DealState[] = ['AGREED', 'AWAITING_PAYMENT', 'HELD', 'OUT', 'RETURNED', 'SETTLED'];
/** Where a deal that ended early branches off the happy path. */
const ENDINGS: DealState[] = ['VOIDED', 'REFUNDED', 'CLAIMED'];

export function stepsFor(deal: Deal): Step[] {
  const total = deal.amountCents + deal.depositCents;
  const detail: Partial<Record<DealState, string>> =
    deal.type === 'sale'
      ? {
          AGREED: `Price agreed at ${usd(deal.amountCents)}.`,
          AWAITING_PAYMENT: 'Waiting for the buyer to approve in PayPal.',
          PAID: `${usd(deal.amountCents)} captured by PayPal.`,
          SETTLED: 'Seller paid out.',
        }
      : deal.type === 'borrow'
        ? {
            AGREED: `Free loan agreed. A ${usd(deal.depositCents)} deposit is held while it is out.`,
            AWAITING_PAYMENT: 'Waiting for the borrower to approve the deposit hold in PayPal.',
            HELD: `${usd(deal.depositCents)} deposit held on a PayPal authorization. Nothing has moved yet.`,
            OUT: 'Handed over; "before" photos saved.',
            RETURNED: 'Returned; photos compared.',
            SETTLED: 'Returned in good order: the deposit hold was released and nothing was charged.',
          }
        : {
          AGREED: `Rent agreed at ${usd(deal.amountCents)}, deposit ${usd(deal.depositCents)}.`,
          AWAITING_PAYMENT: 'Waiting for the renter to approve in PayPal.',
          HELD: `${usd(total)} held on one PayPal authorization (rent ${usd(deal.amountCents)} + deposit ${usd(deal.depositCents)}). Nothing has moved yet.`,
          OUT: 'Handed over; "before" photos saved.',
          RETURNED: 'Returned; photos compared.',
          SETTLED: `Rent of ${usd(deal.amountCents)} captured; the rest of the hold was released.`,
        };

  const path = deal.type === 'sale' ? SALE : RENT;
  const title: Record<DealState, string> = {
    AGREED: 'Agreed',
    AWAITING_PAYMENT: 'Awaiting payment',
    PAID: 'Paid',
    HELD: 'Held',
    OUT: 'Out',
    RETURNED: 'Returned',
    SETTLED: 'Settled',
    VOIDED: 'Cancelled',
    CLAIMED: 'Damage claim',
    REFUNDED: 'Refunded',
  };
  const endDetail: Partial<Record<DealState, string>> = {
    VOIDED: 'Cancelled before any money moved; the hold (if any) was voided.',
    REFUNDED: 'The payment was refunded to the buyer.',
    CLAIMED: 'A deduction is awaiting agreement or review. Nothing has been captured yet.',
  };

  const reached = new Set(deal.timeline.map((t) => t.state));
  const ending = ENDINGS.filter((s) => reached.has(s));
  // A claim sits between RETURNED and SETTLED: show it inline, not as a dead end.
  // The item never came back: OUT went straight to a claim, so there is no "Returned" step.
  const neverReturned = reached.has('CLAIMED') && !reached.has('RETURNED') && reached.has('OUT');
  const steps = [...path, ...ending.filter((s) => s === 'CLAIMED')]
    .filter((s) => !(neverReturned && s === 'RETURNED'))
    .sort((a, b) => order(deal, a) - order(deal, b));
  const terminal = ending.filter((s) => s !== 'CLAIMED');
  const visible = terminal.length ? path.filter((s) => reached.has(s)).concat(terminal) : steps;

  return visible.map((state) => ({
    state,
    title: neverReturned && state === 'CLAIMED' ? 'Not returned' : title[state],
    detail:
      neverReturned && state === 'CLAIMED'
        ? `Not returned: the owner claimed the whole ${usd(total)} hold.`
        : neverReturned && state === 'SETTLED'
          ? `The full ${usd(total)} hold was captured and the owner paid out.`
          : (detail[state] ?? endDetail[state] ?? ''),
  }));
}

function order(deal: Deal, state: DealState): number {
  if (state === 'CLAIMED') return RENT.indexOf('RETURNED') + 0.5;
  return (deal.type === 'sale' ? SALE : RENT).indexOf(state);
}
