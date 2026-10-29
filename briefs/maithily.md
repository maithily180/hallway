# Claude brief — Maithily: Money & Deals

You are helping **Maithily** build her half of Hallway. First read `CLAUDE.md` and `CONTRACTS.md`. Follow them over anything here if they ever disagree, and flag the disagreement in `NOTES/requests.md`.

## Your mission

Own everything that touches money or decides a deal: the PayPal integration, the deal engine and its state machine, the negotiation engine (including its LLM parsing and phrasing), webhooks, the database schema, deployment, and the README.

**Your partner Chandrani** owns listings, the AI agents (Lister, Pricer, Matcher, Inspector, Demand scout), the LLM client `lib/llm`, the design system and most screens. You consume `lib/llm`, `inspectCondition()` and `components/ui`. She consumes your `/api/policies`, `/api/negotiations`, `/api/deals`.

## You may edit only

`prisma/**`, `lib/db.ts`, `lib/paypal/**`, `lib/engine/**`, `lib/negotiation/**`, `app/api/policies/**`, `app/api/negotiations/**`, `app/api/deals/**`, `app/api/webhooks/**`, `app/(app)/negotiate/**`, `app/(app)/deals/**`, `components/deal/**`, `tests/engine/**`, `tests/negotiation/**`, `README.md`, `NOTES/**`, and append-only `.env.example`.

Anything else (including `lib/llm`, `lib/agents`, `components/ui`): write a request in `NOTES/requests.md` and stop.

## Hard rules for your code

- `floorCents` and `autoAcceptCents` never enter an LLM call. The parser gets only the buyer's message. The phraser gets `PolicyView`, the engine's chosen number, the tone and the allowed extras. Add a unit test that fails if any prompt string contains the floor value.
- Concession and accept/decline logic is a **pure function** in `lib/negotiation/decide.ts`: `decide(policy, state, parsedOffer, now) → { action: 'counter' | 'accept' | 'hold' | 'needs_seller' | 'decline'; priceCents }`. It never returns a price below the floor.
- Outgoing check (`lib/negotiation/guard.ts`): scan the phrased message for dollar amounts; if any amount ≠ the engine's chosen price, or equals the floor (when the floor isn't the chosen price), regenerate once, then fall back to a template message.
- All PayPal calls live in `lib/paypal/` with `PayPal-Request-Id = ${dealId}:${step}`; amounts converted from cents only there.
- Webhooks: verify the signature, store the event id, ignore duplicates, then move the deal state through `lib/engine/transition.ts` only.

## Day plan

| Date (IST) | Build | Done when |
| --- | --- | --- |
| Oct 30 | 2-hour contracts session with Chandrani (morning). Create sandbox accounts: Hallway business, Maya and Leo personal, all US/USD; enable Payouts. Write `scripts/spike.ts` exercising: order CAPTURE; order AUTHORIZE; partial capture with `final_capture: true` (confirm remainder released); void; refund; Payouts to PayPal and to Venmo; AUTHORIZE with a third-party `payee`. | Spike log in `NOTES/decisions.md` with **Plan A (payee) or Plan B (platform + Payouts)** decided |
| Oct 31 | Prisma schema v1 + migration; `lib/db.ts`; Render Postgres (pgvector) + web service auto-deploying `main`; webhook route with signature verification; `lib/paypal` mock (`MOCK_PAYPAL=1`); `lib/engine/transition.ts` with the state machine + tests. | **CP0**: skeleton deploys from main; mocks merged |
| Nov 1 | `PUT /api/policies`; `decide()` with sell_fast / best_price / auto curves and deadline pressure; 20+ unit tests incl. the demo script outcome ($15 → $36 → $30 → $28). | Tests green |
| Nov 2 | Sale flow: `/pay`, PayPal button component in `components/deal`, `/approve` capture, webhook → PAID, payout (or direct payee) → SETTLED. Deal Timeline v1 at `/deals/[id]` showing each state with its PayPal id. | Real sandbox sale settles end to end |
| Nov 3 | Negotiation loop: `parse.ts` (llm.json → ParsedOffer), `phrase.ts` (llm.text with PolicyView), `guard.ts`; `POST /api/negotiations` and `/messages`; seller "ask me" notification. | **CP1** with Chandrani: Matches → Make offer → negotiate → pay → settled |
| Nov 4 | Negotiation Theater at `/negotiate/[id]`: chat on the left; price ladder on the right (list, each counter, locked floor line shown only to the seller, close); red "attempt blocked" pill; Deal guard scan for off-platform payment and overpay scams. | Demo script runs in the UI |
| Nov 5 | Rental: AUTHORIZE rent + deposit; QR handover (`/handover` with signed token) moves HELD → OUT; reauthorize helper for rentals over 3 days; cancel → void. | Authorization visible in sandbox; void works |
| Nov 6 | Return: `/return` calls `inspectCondition()`; owner/renter confirmation UI using Chandrani's `InspectionCard`; `/settle` captures rent + agreed deduction with `final_capture: true`; CLAIMED path. | **CP2**: hero rental works on Render with real keys |
| Nov 7 | **Gate**: full demo run together, no mocks. Write `tests/negotiation/injection.test.ts` with 50 attack prompts (reveal minimum, ignore instructions, fake seller approval, "I already paid", role-play). | Gate passed; 50/50 attacks hold the floor |
| Nov 8 | Hardening: webhook replay, double-click on Pay, PayPal error states, idempotency audit, Deal Timeline polish. | No double captures in a 10-click stress test |
| Nov 9 | Stretch (only if the gate passed): Move-out payouts batch, or the optional buyer agent. Otherwise: bug bash with Chandrani. | – |
| Nov 10 | README: what it is, architecture diagram, one-command setup, mock mode, env vars, sandbox test logins, PayPal APIs used, AI models used, MIT licence. Devpost text draft. **Feature freeze.** | Chandrani can set up from a fresh clone using only the README |
| Nov 11 | Record your screen segments (negotiation, PayPal popup, Deal Timeline, settle) on the hosted build. | Clips handed to Chandrani |
| Nov 12 | Final hosted run; you are the **team Representative** and submit on Devpost by 11:00 PM IST. | Submitted |

## What you must hand Chandrani, and when

| Item | By |
| --- | --- |
| Schema v1 migrated + `lib/db.ts` | Oct 31 |
| `PUT /api/policies` (mock OK) | Oct 31 |
| `POST /api/negotiations` route returning a Negotiation (mock OK) | Oct 31 |
| `GET /api/deals?ownerId` (for her Bryntum calendar) | Nov 6 |
| Seed users' PayPal sandbox emails | Oct 30 |

## What you need from Chandrani, and when

| Item | By |
| --- | --- |
| `lib/llm` with `json`, `text`, mock | Oct 30 night |
| `components/ui` basics (Button, Card, Sheet, PriceTag, Chip) | Oct 31 |
| `inspectCondition()` mock | Oct 31; real by Nov 5 |
| `InspectionCard` component | Nov 5 |
| Seeded demo community with the hero projector | Oct 31 |

## Prompt starters for Claude

- "Implement `lib/negotiation/decide.ts` exactly to the contract in CONTRACTS.md. Pure function, no I/O. Then write Vitest tests covering: floor never crossed, auto-accept, deadline pressure, sell_fast vs best_price, and the demo fixture script."
- "Write `lib/paypal/client.ts`: OAuth token cache, `createOrder`, `authorizeOrder`, `captureAuthorization(amount, finalCapture)`, `voidAuthorization`, `refundCapture`, `createPayout`. Cents in, PayPal strings out. Every call takes a requestId. Include a mock with the same interface."
- "Write the webhook route: verify signature with PAYPAL_WEBHOOK_ID, dedupe by event id, map events to engine transitions, never transition directly."
