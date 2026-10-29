import type { LlmApi, Negotiation, ParsedOffer, Policy } from '@/lib/contracts';
import { decide, type Decision, type NegotiationState } from './decide';
import { scanBuyerMessage, type BlockedReason } from './dealguard';
import { parseBuyerMessage } from './parse';
import { phraseReply, templateReply, toPolicyView } from './phrase';

export interface TurnResult {
  parsed: ParsedOffer;
  decision: Decision;
  reply: string;
  blockedReason?: BlockedReason;
  usedFallback: boolean;
  nextState: NegotiationState;
  status: Negotiation['status'];
  agreedCents?: number;
}

const NO_OFFER: ParsedOffer = { offerCents: null, conditions: [], intent: 'other' };

const STATUS: Record<Decision['action'], Negotiation['status']> = {
  accept: 'agreed',
  counter: 'open',
  hold: 'open',
  needs_seller: 'needs_seller',
  decline: 'declined',
};

/**
 * One negotiation turn: scan, parse, decide (code), phrase, check.
 * The policy (with its floor) is used only by decide(); the LLM gets PolicyView.
 */
export async function runTurn(input: {
  llm: LlmApi;
  policy: Policy;
  state: NegotiationState;
  buyerText: string;
  now: Date;
}): Promise<TurnResult> {
  const { llm, policy, state, buyerText, now } = input;

  // Flagged messages never reach the model: no offer, round not counted, price held.
  const blockedReason = scanBuyerMessage(buyerText);
  const parsed = blockedReason ? NO_OFFER : await parseBuyerMessage(llm, buyerText);

  const decision = decide(policy, state, parsed, now);

  const phrased = blockedReason
    ? { text: templateReply(decision, blockedReason), usedFallback: true }
    : await phraseReply(llm, toPolicyView(policy), decision, buyerText);

  const nextState: NegotiationState = {
    round: state.round + (decision.countsRound ? 1 : 0),
    lastCounterCents:
      decision.action === 'counter' || decision.action === 'hold'
        ? decision.priceCents
        : state.lastCounterCents,
  };

  return {
    parsed,
    decision,
    reply: phrased.text,
    blockedReason,
    usedFallback: phrased.usedFallback,
    nextState,
    status: STATUS[decision.action],
    agreedCents: decision.action === 'accept' ? decision.priceCents : undefined,
  };
}
