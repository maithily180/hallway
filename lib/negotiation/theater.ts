import type { Cents, NegoMessage, Negotiation } from '@/lib/contracts';
import { extractAmountsCents } from './guard';

export type LadderPoint =
  | { kind: 'list'; cents: Cents }
  | { kind: 'offer'; cents: Cents; round: number }
  | { kind: 'counter'; cents: Cents; round: number }
  | { kind: 'blocked'; reason: NonNullable<NegoMessage['blockedReason']> }
  | { kind: 'agreed'; cents: Cents };

/**
 * The price ladder for the Negotiation Theater, built only from what was said in the chat.
 * The outgoing guard guarantees an agent message mentions only the engine's price, so the
 * first amount in an agent message is that turn's counter.
 */
export function buildLadder(
  listPriceCents: Cents,
  messages: NegoMessage[],
  negotiation: Pick<Negotiation, 'status' | 'agreedCents'>,
): LadderPoint[] {
  const points: LadderPoint[] = [{ kind: 'list', cents: listPriceCents }];
  let round = 0;
  let lastCounter: Cents | undefined;
  // On an agreed deal the last agent message is the acceptance, drawn as the close, not a counter.
  const closingMessageId =
    negotiation.status === 'agreed' ? messages.findLast((m) => m.from === 'agent')?.id : undefined;

  for (const m of messages) {
    if (m.from === 'buyer') {
      if (m.blockedReason) {
        points.push({ kind: 'blocked', reason: m.blockedReason });
      } else if (m.parsedOffer?.offerCents != null) {
        round += 1;
        points.push({ kind: 'offer', cents: m.parsedOffer.offerCents, round });
      }
    } else if (m.from === 'agent' && m.id !== closingMessageId) {
      const price = extractAmountsCents(m.text)[0];
      const last = points[points.length - 1];
      // Only a turn that answered an offer with a NEW price of ours is a counter. A reply that echoes
      // the buyer's own number ("let me check with the seller on $16") or restates our standing price
      // (a hold, or a final "my last offer still stands") is not.
      if (price !== undefined && last?.kind === 'offer' && price !== last.cents && price !== lastCounter) {
        points.push({ kind: 'counter', cents: price, round: last.round });
        lastCounter = price;
      }
    }
  }

  if (negotiation.status === 'agreed' && negotiation.agreedCents !== undefined) {
    points.push({ kind: 'agreed', cents: negotiation.agreedCents });
  }
  return points;
}

/** The buyer's most recent priced offer: what the seller is asked to accept in "ask me" mode. */
export function latestOfferCents(messages: NegoMessage[]): Cents | undefined {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.from === 'buyer' && !m.blockedReason && m.parsedOffer?.offerCents != null) {
      return m.parsedOffer.offerCents;
    }
  }
  return undefined;
}
