/**
 * Seeds Postgres with the demo community, users, listings and a negotiation policy for each.
 * Idempotent: safe to run on every deploy. Reads the same cast and listings as the in-memory
 * demo (`seed/demo.ts`), so mock mode and hosted mode show the same marketplace.
 */
import { db } from '@/lib/db';
import { defaultPolicy } from '@/lib/negotiation/default-policy';
import { DEMO_COMMUNITY, DEMO_LISTINGS, DEMO_USERS } from '@/seed/demo';

/** Read at call time so tests and deploys can set the sandbox emails before seeding. */
const payoutEmail = (userId: string): string | undefined =>
  (userId === 'maya' ? process.env.SANDBOX_MAYA_EMAIL : userId === 'leo' ? process.env.SANDBOX_LEO_EMAIL : undefined) || undefined;

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
    const p = defaultPolicy(l.id, {
      ownerId: l.ownerId,
      modes: l.modes,
      depositCents: l.depositCents ?? 0,
      salePriceCents: l.salePriceCents,
      rentPerDayCents: l.rentPerDayCents,
    });
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
