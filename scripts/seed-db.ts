/** `pnpm seed`: seeds Postgres with the demo marketplace (idempotent; see lib/db-seed.ts). */
import { db } from '@/lib/db';
import { seedDemo } from '@/lib/db-seed';

seedDemo()
  .then((n) => console.log(`seeded ${n.users} users, ${n.listings} listings, ${n.policies} policies`))
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
