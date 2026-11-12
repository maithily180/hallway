import type { Cents, Policy } from '@/lib/contracts';
import type { ListingInfo } from './store';

export type NegotiationKind = 'sale' | 'rent';

/** A free loan: lend-only listing, or an explicit request to borrow a lend-and-rent one. */
export function isLoanOnly(info: Pick<ListingInfo, 'modes'>): boolean {
  return info.modes.includes('lend') && !info.modes.includes('rent');
}

/** Which price the owner's policy is written against. */
function policyBasis(policy: Policy, info: ListingInfo): NegotiationKind {
  if (info.rentPerDayCents !== undefined && policy.listPriceCents === info.rentPerDayCents) return 'rent';
  if (info.salePriceCents !== undefined && policy.listPriceCents === info.salePriceCents) return 'sale';
  // Neither matches (the owner picked their own list price): assume it is for the main mode.
  return info.modes.includes('rent') ? 'rent' : 'sale';
}

/**
 * A listing has one policy, but can be offered for rent and for sale at very different prices.
 * When the buyer negotiates the mode the policy is NOT written against, the owner's intent is
 * kept as a proportion: the list price becomes that mode's price, and the floor and auto-accept
 * scale by the same ratio (so a floor at 62.5% of list stays at 62.5% of list).
 *
 * Pure. The result still satisfies floor <= auto-accept <= list, so `decide()` is unchanged.
 */
export function effectivePolicy(policy: Policy, info: ListingInfo, kind: NegotiationKind): Policy {
  const target = kind === 'sale' ? info.salePriceCents : info.rentPerDayCents;
  if (!target || target <= 0 || policy.listPriceCents <= 0) return policy;
  if (policyBasis(policy, info) === kind) return policy;

  const ratio = target / policy.listPriceCents;
  const autoAcceptCents: Cents = Math.min(target, Math.round(policy.autoAcceptCents * ratio));
  const floorCents: Cents = Math.min(autoAcceptCents, Math.max(1, Math.round(policy.floorCents * ratio)));
  return { ...policy, listPriceCents: target, floorCents, autoAcceptCents };
}
