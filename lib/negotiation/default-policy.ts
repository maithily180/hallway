import type { Policy } from '@/lib/contracts';
import type { ListingInfo } from './store';

/** The demo projector's script: list $40/day, floor $25, auto-accept $34, three rounds. */
export const HERO = { id: 'hero-projector', floorCents: 2500, autoAcceptCents: 3400 } as const;

/**
 * The policy a listing starts with before its owner chooses their own: Hallway negotiates for
 * them, never below 70% of the list price, and accepts anything from 90%. Used by the seed and
 * by mock mode so "make an offer" works on every priced listing. `null` when nothing is priced
 * (a free loan has nothing to negotiate).
 *
 * One policy covers a listing, so it is written against the main mode (rent first); the other
 * mode is scaled from it (see `effectivePolicy`).
 */
export function defaultPolicy(listingId: string, info: ListingInfo): Policy | null {
  const list = info.modes.includes('rent') ? info.rentPerDayCents : info.salePriceCents;
  if (!list) return null;
  const hero = listingId === HERO.id;
  return {
    listingId,
    listPriceCents: list,
    floorCents: hero ? HERO.floorCents : Math.round(list * 0.7),
    autoAcceptCents: hero ? HERO.autoAcceptCents : Math.round(list * 0.9),
    mode: 'full_auto',
    strategy: 'best_price',
    maxRounds: 3,
    tone: 'friendly',
    extrasAllowed: hero ? ['include HDMI cable'] : [],
  };
}
