# Changelog

One line per merged task: date · who · what
- 2026-10-29 · Maithily · Scaffold, contracts v1, Prisma schema v1, deal state machine, PayPal client + mock, spike script
- 2026-10-29 · Maithily · `decide()` negotiation core with demo-script and floor-invariant tests
- 2026-10-30 · Maithily · Deal service (pay/approve/cancel/payout), webhook handler, deal + webhook routes, negotiation->deal hook
- 2026-10-30 · Maithily · Rental handover (QR), return + Inspector hook, settle with final_capture, reauthorize, and their routes
- 2026-10-30 · Maithily · Deal Timeline page /deals/[id] (buyer QR, owner handover, return, settle), PayPal button (real SDK + mock)
- 2026-10-30 · Maithily · Negotiation Theater /negotiate/[id]: chat, live price ladder (owner-only locked floor), blocked pill, seller accept/decline
- 2026-10-30 · Maithily · 50-attack injection suite (150 runs); guard now catches spelled-out and cents amounts; model parse failure = no offer
- 2026-10-30 · Maithily · Initial Prisma migration, Render blueprint, /api/health, README
- 2026-10-30 · Maithily · DB integration tests (Prisma stores vs real Postgres + pgvector); migration verified
