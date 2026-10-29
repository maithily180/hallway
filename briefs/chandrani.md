# Claude brief — Chandrani: Listings & Intelligence

You are helping **Chandrani** build her half of Hallway. First read `CLAUDE.md` and `CONTRACTS.md`. Follow them over anything here if they ever disagree, and flag the disagreement in `NOTES/requests.md`.

## Your mission

Own everything that understands things and people: the LLM client, the Lister, Pricer, Matcher, Inspector and Demand scout agents, the design system, the app shell and login, the seller and buyer screens, the Bryntum calendar, seed data, the campus survey, and the final video edit.

**Your partner Maithily** owns PayPal, the deal engine, negotiation, webhooks, schema and deploy. You consume her `/api/policies`, `/api/negotiations`, `/api/deals` and the Prisma schema. She consumes your `lib/llm`, `inspectCondition()`, `components/ui` and seed data.

## You may edit only

`lib/llm/**`, `lib/agents/**`, `app/api/listings/**`, `app/api/price/**`, `app/api/match/**`, `app/api/wants/**`, `app/api/inspect/**`, `app/(app)/home/**`, `app/(app)/sell/**`, `app/(app)/matches/**`, `app/(app)/stuff/**`, `app/(app)/wanted/**`, `components/ui/**`, `app/layout.tsx`, `app/globals.css`, auth files, `seed/**`, `tests/agents/**`, `NOTES/**`, and append-only `.env.example`.

Anything else (including `prisma/**`, `lib/paypal`, `lib/engine`, `lib/negotiation`): write a request in `NOTES/requests.md` and stop.

## Hard rules for your code

- Agents never see `floorCents` or `autoAcceptCents`, and never call PayPal. CI greps `lib/agents/**` for `floorCents`.
- **Numbers are computed in code, words by the LLM.** The Pricer computes every price from inputs (Channel3 new price × category depreciation × condition factor × urgency) and the LLM only writes the one-line explanation from those numbers.
- Every LLM output is validated with the contract zod schema; on failure retry once, then return a safe fallback (e.g. a draft with `missingInfo: ["Please describe the item"]`).
- The Inspector only **proposes**. `proposedDeductionCents` is capped at the deposit and is 0 when `confidence < 0.6`.
- No brand names or logos in seed data, UI copy or the video. `brandModelGuess` is internal only.
- `lib/llm` mock (`MOCK_LLM=1`) must return fixtures for every agent so the whole demo clicks through with no keys.

## Day plan

| Date (IST) | Build | Done when |
| --- | --- | --- |
| Oct 30 | 2-hour contracts session with Maithily (morning). Next.js app shell, Tailwind tokens (one accent colour, warm neutrals), `components/ui` (Button, Card, Sheet, Chip, PriceTag, Avatar, EmptyState). `lib/llm` with `json`, `vision`, `text`, retries and the mock. | `lib/llm` merged by night so Maithily can build on it |
| Oct 31 | Campus-email login (domain check against `CAMPUS_EMAIL_DOMAIN`, demo password for judges). Photograph ~25 real items yourself (no brands visible); `seed/` script for Demo University, Maya, Leo and the hero projector. `inspectCondition()` mock. Home screen with the "What do you need?" box. | **CP0**: app shell + login + seed on Render |
| Nov 1 | Lister: `draftListing()` with vision → `ListingDraft`, defects, missing-info questions. Snap-to-list screen at `/sell` (upload, draft card, answer missing info). | 10 of your seed photos produce sensible drafts |
| Nov 2 | Pricer: Channel3 lookup for new price, depreciation table per category (in code), condition and urgency factors; LLM explanation. Price card with fast-sale vs best-price. "Set your floor" screen that saves via Maithily's `PUT /api/policies` (lock icon: "Hallway never reveals this"). | Hero projector prices at about $40/day, $150 deposit |
| Nov 3 | Matcher: embeddings on listing create (pgvector), `parseWant()`, `findMatches()` with the score formula (price, availability, condition, owner reliability, needs met) and a reason line. Matches screen with "Make offer" / "Rent it" calling `POST /api/negotiations` then routing to `/negotiate/[id]`. | **CP1** with Maithily: Matches → negotiate → pay → settled |
| Nov 4 | Inspector: `inspectCondition()` compares before/after sets; returns same-item check, new damage with regions, missing parts, confidence, proposed deduction. Build an eval of 10 photo pairs (5 clean, 5 with a scratch/missing cable) in `tests/agents/inspector.eval.ts`. | ≥ 8/10 correct on the eval |
| Nov 5 | `InspectionCard` in `components/ui` (photos side by side, damage regions boxed, confidence, deduction) handed to Maithily. Buy vs rent vs borrow advisor on Matches (Channel3 new price vs rent vs free borrow, with the math). | Maithily's return page renders your card |
| Nov 6 | Wanted board at `/wanted`; `GET /api/wants/demand`; Demand scout tip on My Stuff ("7 people looked for a drill; rent yours at $5/day"); notify owners whose items match a want. | **CP2**: hero rental works on Render with real keys |
| Nov 7 | **Gate**: full demo run together, no mocks. Fix your bugs. Send the 2-minute survey to 3 to 4 campus group chats. | Gate passed; survey live |
| Nov 8 | My Stuff at `/stuff`: your items, earnings, and a **Bryntum Scheduler** showing each item as a resource and rentals as events from `GET /api/deals?ownerId`. | Calendar shows the hero rental |
| Nov 9 | Stretch (only if the gate passed): Move-out mode (video → frames → multiple drafts → bulk list). Otherwise: mobile layout pass, empty and error states, loading skeletons. | – |
| Nov 10 | Design polish pass on every screen; take README screenshots; add survey numbers to `NOTES/` for Maithily's README. **Feature freeze.** | Screens look finished on a phone |
| Nov 11 | Record your segments (Snap to list, price, floor, Matches, Inspector, calendar); edit the full video with Maithily's clips to under 3 minutes, voice-over, no copyrighted music; upload to YouTube (public). | Video link in `NOTES/submission.md` |
| Nov 12 | Final hosted run; Devpost images and thumbnail; review the submission with Maithily before 11:00 PM IST. | Submitted |

## What you must hand Maithily, and when

| Item | By |
| --- | --- |
| `lib/llm` (`json`, `text`, mock) | Oct 30 night |
| `components/ui` basics | Oct 31 |
| Seed community, users, hero projector | Oct 31 |
| `inspectCondition()` mock | Oct 31; real by Nov 5 |
| `InspectionCard` | Nov 5 |
| Survey numbers + screenshots | Nov 10 |
| Edited video | Nov 11 |

## What you need from Maithily, and when

| Item | By |
| --- | --- |
| Prisma schema v1 + `lib/db.ts` | Oct 31 |
| `PUT /api/policies` and `POST /api/negotiations` (mock OK) | Oct 31 |
| `GET /api/deals?ownerId` | Nov 6 |
| Her screen recordings | Nov 11 |

## Prompt starters for Claude

- "Write `lib/llm/index.ts` exposing `json(schema, messages, opts)`, `vision(schema, images, prompt)` and `text(messages, opts)` over the Anthropic API, with one retry on schema failure, and a `MOCK_LLM` mode returning fixtures from `lib/llm/fixtures/*.json`."
- "Implement `draftListing()` per CONTRACTS.md. The vision prompt must ask for defects and list missing information as questions, never invent accessories, and never output brand names in `title` or `description`."
- "Implement the Pricer so every number is computed in TypeScript from: Channel3 new price, a per-category depreciation table, a condition factor and urgency. Then ask the LLM for a one-sentence explanation that uses only those numbers."
- "Build `findMatches()` with pgvector similarity plus the documented score formula; return the top 3 with a plain-language reason each."
