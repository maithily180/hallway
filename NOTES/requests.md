# Requests

Format: date · from · to · path · what and why
- 2026-10-29 · Maithily · Chandrani · lib/llm/index.ts · Please export `llm` (the `LlmApi` object from CONTRACTS section 2) so `lib/negotiation/runtime.ts` can import it. Until then negotiation runs only with MOCK_LLM=1 using my own scripted mock.
- 2026-10-29 · Maithily · Chandrani · auth · My API routes read the current user from an `x-user-id` header as a stand-in. When login lands, please expose a server helper like `getSessionUser(req)` and I will swap `currentUserId` in `lib/negotiation/http.ts`.
- 2026-10-29 · Maithily · Chandrani · app/layout.tsx, app/page.tsx, app/globals.css · I committed bare placeholders so the app builds. Replace them freely with the real design system.
- 2026-10-30 · Maithily · Chandrani · lib/agents · `/api/deals/:id/return` calls the Inspector through the `inspect` dependency in `lib/engine/runtime.ts`. It currently defaults to a clean-return mock. When `inspectCondition()` lands in `lib/agents`, tell me and I will wire it (it needs the full Listing, which I will load from the DB).
