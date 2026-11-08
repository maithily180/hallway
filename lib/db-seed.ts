/**
 * Seeds Postgres with the demo community, users, listings and a negotiation policy for each.
 * Idempotent: safe to run on every deploy. Reads the same cast and listings as the in-memory
 * demo (`seed/demo.ts`), so mock mode and hosted mode show the same marketplace.
 */
import type { Policy } from '@/lib/contracts';
import { db } from '@/lib/db';
import { DEMO_COMMUNITY, DEMO_LISTINGS, DEMO_USERS } from '@/seed/demo';

/** Read at call time so tests and deploys can set the sandbox emails before seeding. */
const payoutEmail = (userId: string): string | undefined =>
  (userId === 'maya' ? process.env.SANDBOX_MAYA_EMAIL : userId === 'leo' ? process.env.SANDBOX_LEO_EMAIL : undefined) || undefined;

/** The hero projector's script: list $40/day, floor $25, auto-accept $34, three rounds. */
const HERO = { id: 'hero-projector', floorCents: 2500, autoAcceptCents: 3400 };

function defaultPolicy(listing: (typeof DEMO_LISTINGS)[number]): Policy | null {
  // One policy per listing: price it by how the item is mainly offered (rent first).
  const list = listing.modes.includes('rent') ? listing.rentPerDayCents : listing.salePriceCents;
  if (!list) return null;
  const isHero = listing.id === HERO.id;
  return {
    listingId: listing.id,
    listPriceCents: list,
    floorCents: isHero ? HERO.floorCents : Math.round(list * 0.7),
    autoAcceptCents: isHero ? HERO.autoAcceptCents : Math.round(list * 0.9),
    mode: 'full_auto',
    strategy: 'best_price',
    maxRounds: 3,
    tone: 'friendly',
    extrasAllowed: isHero ? ['include HDMI cable'] : [],
  };
}

export async function seedDemo(): Promise<{ users: number; listings: number; policies: number }> {
  await db.community.upsert({
    where: { id: DEMO_COMMUNITY.id },
    update: {},
    create: { ...DEMO_COMMUNITY, pickupSpots: ['Library steps', 'Tower B lobby'] },
  });

  for (const u of DEMO_USERS) {
    const data = { name: u.name, email: `${u.id}@demo.edu`, communityId: DEMO_COMMUNITY.id, paypalEmail: payoutEmail(u.id) ?? null };
    await db.user.upsert({ where: { id: u.id }, update: { paypalEmail: data.paypalEmail }, create: { id: u.id, ...data } });
  }

  let policies = 0;
  for (const l of DEMO_LISTINGS) {
    const { createdAt, ...rest } = l;
    await db.listing.upsert({
      where: { id: l.id },
      update: {},
      create: { ...rest, createdAt: new Date(createdAt) },
    });
    const p = defaultPolicy(l);
    if (p) {
      // Never overwrite a policy an owner already chose.
      await db.policy.upsert({
        where: { listingId: p.listingId },
        update: {},
        create: { ...p, deadline: null },
      });
      policies += 1;
    }
  }

  return { users: DEMO_USERS.length, listings: DEMO_LISTINGS.length, policies };
}
