# Requests

Format: date · from · to · path · what and why
- 2026-11-02 · Chandrani · Maithily · lib/engine/runtime.ts · `inspectCondition(before, after, listing)` is in `lib/agents` (deduction capped at deposit, 0 below 0.6 confidence, safe fallback on model failure). Please wire it as the `inspect` dependency.
- 2026-11-02 · Chandrani · Maithily · m/spike · main now has the app shell, `lib/contracts`, `lib/llm` (exports `llm`) and `components/ui`. #1 conflicts with main; please rebase onto main, keeping main's versions of those paths.
- 2026-11-02 · Chandrani · Maithily · prisma, lib/db.ts · `/sell` publishes via `POST /api/listings` (mine, needs `lib/db.ts` + the Listing model on main) then `PUT /api/policies/:id` (yours). Both 404 on main until #1 lands; the screen shows a friendly message meanwhile.
