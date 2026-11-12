# Changelog

One line per merged task: date · who · what
- 2026-11-02 · Chandrani · Lister (draftListing + POST /api/listings/draft), Pricer (computed prices, Channel3 anchor, LLM one-liner + POST /api/price), inspectCondition with deposit cap and confidence gate
- 2026-11-02 · Chandrani · /sell snap-to-list: photos → draft (answer missing info) → price card (fast sale vs best price, rent + deposit) → set your floor
- 2026-11-02 · Chandrani · Campus-email login (domain check + demo password), signed session cookie, getSessionUser(req), /login and middleware for app screens
- 2026-11-03 · Chandrani · Matcher (parseWant, findMatches with documented score + reason), POST /api/wants, POST/GET /api/listings (in-memory demo store), /matches screen, demo seed data, /sell publishes
- 2026-11-04 (C): `InspectionCard` in `components/ui` (before/after side by side, damage boxed, confidence, deduction); `POST /api/inspect`; inspector eval harness (`pnpm eval:inspector`, needs 10 photo pairs + key). Buy/rent/borrow advisor on Matches. Wanted board `/wanted`, `GET /api/wants/demand`, demand scout tips and "someone could use your stuff" on `/stuff`. My Stuff with a Bryntum Scheduler (trial) fed by `GET /api/deals?ownerId`.
- 2026-11-04 (C): App shell for signed-in screens: top bar with avatar and log out, bottom tabs (Find, Wanted, Sell, My Stuff), loading skeleton and error screen.
- 2026-11-04 (C): Move-out mode at `/sell/moveout`: video or photos → frames → one draft per frame (duplicates and unsure drafts dropped) → fast-sale prices → bulk list with floors at 80% via `PUT /api/policies`.
- 2026-11-07 (C): Listing detail at `/matches/[id]`: photos, condition and defects, every way to get it (buy/rent/borrow with deposit), demand count, and the negotiate buttons. Linked from Matches and My Stuff.
- 2026-11-07 (C): Design pass: refined tokens (soft accent, surface-2, shadows, focus rings), Button sizes, Icon set, category ItemThumb art, ListingCard, Stat, Logo. Sticky header with desktop nav and mobile tabs; redesigned Home (pill search, On campus now grid, Most wanted bars), Matches (thumbs, match %, checklist reasons, sticky advisor), listing detail, Wanted, My Stuff (stats), Login (split panel) and a step bar on Sell.
- 2026-11-08 (C): Owner alerts: My Stuff tab shows a count of open campus requests your listings could fill (header and phone tabs). Wanted board uses one column beside the ranking on desktop; Sell photo picker gets a camera tile.
- 2026-11-12 (C): NOTES/submission.md (checklist, Listings & Intelligence text for DEVPOST.md, video shot list) and a 3:2 Devpost thumbnail in NOTES/devpost/.
- 2026-10-29 (M): Scaffold, contracts v1, Prisma schema v1, deal state machine, PayPal client + mock, spike script
- 2026-10-29 (M): `decide()` negotiation core with demo-script and floor-invariant tests
- 2026-10-30 (M): Deal service (pay/approve/cancel/payout), webhook handler, deal + webhook routes, negotiation->deal hook
- 2026-10-30 (M): Rental handover (QR), return + Inspector hook, settle with final_capture, reauthorize, and their routes
- 2026-10-30 (M): Deal Timeline page /deals/[id] (buyer QR, owner handover, return, settle), PayPal button (real SDK + mock)
- 2026-10-30 (M): Negotiation Theater /negotiate/[id]: chat, live price ladder (owner-only locked floor), blocked pill, seller accept/decline
- 2026-10-30 (M): 50-attack injection suite (150 runs); guard now catches spelled-out and cents amounts; model parse failure = no offer
- 2026-10-30 (M): Initial Prisma migration, Render blueprint, /api/health, README
- 2026-10-30 (M): DB integration tests (Prisma stores vs real Postgres + pgvector); migration verified
- 2026-11-08 (M): Merged main into m/spike (adopted C's scaffold, contracts v1 and lib/llm unchanged). All my routes and pages now use the session cookie (x-user-id removed); only the buyer/owner can read or act on a negotiation or deal; settle takes each side's consent from who is calling. Listings are read from the app's listing store (hero id hero-projector). Inspector wired to inspectCondition. Real photo upload on handover/return. Initial + inspection-deduction migrations.
- 2026-11-08 (M): Real sandbox verified through lib/paypal/client.ts (partial capture + final_capture releases the deposit, idempotent retries, void, refund, Payouts); Plan B decided. Hosted mode: Postgres listing store, idempotent seed, seed in Render start command.
- 2026-11-12 (M): Full test pass. Engine on the real sandbox (7 flows, verified against PayPal's own records), real-Chrome UI run as two users on a production build with Postgres, real PayPal SDK button up to the login popup. Fixed: agreeing is now all-or-nothing (deal created first, status and dealId written together), the pickup code failure is no longer silent, stale next.config.mjs removed.
- 2026-11-08 (M): Free loans (deposit optional), per-mode pricing, deals page, never-returned claim, hold-refresh and payout-retry job, stale-order refresh, 40-message cap, 10-click concurrency tests, CI database job.
