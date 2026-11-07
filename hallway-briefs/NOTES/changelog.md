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
