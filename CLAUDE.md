# Hallway — project brief for Claude

Read this file and `CONTRACTS.md` before doing anything. Then read the brief for the person you are helping: `briefs/maithily.md` or `briefs/chandrani.md`.

## What we are building

Hallway is a campus marketplace where an AI agent runs the whole deal for things students already own: it lists, prices, matches, negotiates, rents and settles. PayPal (sandbox) holds and moves the money.

- Hackathon: PayPal AI Hackathon (Devpost). Hard deadline **Nov 13, 2026, 1:30 AM IST** (Nov 12, noon Pacific). We submit by **Nov 12, 11:00 PM IST**.
- Team: **Maithily** (Money & Deals) and **Chandrani** (Listings & Intelligence).
- Demo story: Maya lists a projector, sets a floor of $25; Leo asks for "a projector tomorrow night under $35"; the agent negotiates to $28 and blocks a prompt-injection attempt; PayPal authorizes $28 rent + $150 deposit; on return the Inspector compares photos; we capture $28 and the $150 is released.

## The one rule that must never break

**The LLM reads, reasons, writes and proposes. Deterministic code computes money and decides what executes.**

- The seller's `floorCents` and `autoAcceptCents` are **never** put into any LLM prompt or context. Agents only ever see `PolicyView` (see CONTRACTS.md).
- No agent calls PayPal. Only code in `lib/paypal/` and `lib/engine/` calls PayPal, and only from the server.
- Every money action goes through the deal engine's state machine and is idempotent (`PayPal-Request-Id` = `${dealId}:${step}`).

## Stack

| Layer | Choice |
| --- | --- |
| App | Next.js (App Router) + TypeScript (strict) + Tailwind, one repo, pnpm |
| AI | One vision-capable LLM with tool calling (Anthropic Claude), via `lib/llm/` |
| PayPal | JS SDK button on the client; REST (Orders v2, Payments v2, Payouts v1) on the server; `@paypal/agent-toolkit` (sandbox) for orders/disputes where it fits |
| DB | Postgres + pgvector on Render, Prisma |
| Photos | S3-compatible storage (R2 or Supabase Storage) |
| Calendar | Bryntum Scheduler (trial npm package) |
| Product data | Channel3 API (new-price anchor) |
| Hosting | Render web service |
| Tests | Vitest |

## Commands (keep these working at all times)

```
pnpm dev            # run locally
pnpm test           # all unit tests
pnpm typecheck
pnpm lint
pnpm db:migrate     # Prisma migrate (Maithily runs migrations)
pnpm seed           # seed demo community, users and ~25 listings (Chandrani owns seed data)
MOCK_PAYPAL=1 MOCK_LLM=1 pnpm dev   # full app with no keys
```

## Who owns what (edit only your owner's paths)

| Path | Owner | Notes |
| --- | --- | --- |
| `lib/contracts/**` | **Shared** | Changes need a PR labelled `contract` approved by both. Bump `CONTRACT_VERSION`. |
| `prisma/**`, `lib/db.ts` | Maithily | Chandrani requests schema changes in `NOTES/requests.md` |
| `lib/paypal/**`, `lib/engine/**`, `lib/negotiation/**` | Maithily | |
| `app/api/policies/**`, `app/api/negotiations/**`, `app/api/deals/**`, `app/api/webhooks/**` | Maithily | |
| `app/(app)/negotiate/**`, `app/(app)/deals/**`, `components/deal/**` | Maithily | |
| `lib/llm/**`, `lib/agents/**` | Chandrani | Maithily's negotiator imports `lib/llm` |
| `app/api/listings/**`, `app/api/price/**`, `app/api/match/**`, `app/api/wants/**`, `app/api/inspect/**` | Chandrani | |
| `app/(app)/home/**`, `app/(app)/sell/**`, `app/(app)/matches/**`, `app/(app)/stuff/**`, `app/(app)/wanted/**` | Chandrani | |
| `components/ui/**`, `app/layout.tsx`, `app/globals.css`, auth | Chandrani | Design system; Maithily uses it, never forks it |
| `seed/**` | Chandrani | |
| `README.md`, `.env.example` | Maithily | `.env.example` is append-only for both |
| `package.json` | Both | Add deps in a small separate commit; rebase before merge |
| `NOTES/**` | Both | Requests, decisions, blockers |

If a task needs a change outside the owner's paths: **stop, do not edit**, and append a request to `NOTES/requests.md` with what and why.

## Coding conventions

- Money is always integer **cents** (`amountCents: number`). Convert to PayPal's `"28.00"` strings only inside `lib/paypal/`.
- Currency is always `USD`. All sandbox accounts are US.
- Validate every API request and every LLM JSON output with the zod schemas from `lib/contracts`. Reject on failure; never "best effort" parse money.
- Server-only secrets. Nothing under `lib/paypal`, `lib/engine`, `lib/llm` is imported by client components.
- Each module ships a **mock** that satisfies the same contract (`MOCK_PAYPAL`, `MOCK_LLM`). The mock must be good enough to click through the demo.
- No third-party brand names or logos in UI copy, seed data or screenshots (hackathon video rule). Use generic item names ("projector", not a brand).
- Prefer small files and pure functions; the engine and the negotiation decision code must be pure and unit-tested.

## Git workflow (so merging is never a problem)

- `main` is always deployable. Short branches: `m/<topic>` and `c/<topic>`.
- Open a PR at least once a day; the other person reviews within 12 hours; CI (typecheck, lint, test) must pass.
- **Daily merge at 10 PM IST**, then both rebase.
- Never reformat or rename files you don't own. Never run a repo-wide formatter in a feature PR.
- Contract changes are their own PR, nothing else in it.

## Integration checkpoints

| Date (IST) | Checkpoint | Done means |
| --- | --- | --- |
| Oct 30, evening | Contracts v1 frozen | `lib/contracts` merged; both mocks compile against it |
| Oct 31, night | CP0 skeleton | App shell, login, schema v1, mocks, Render deploy from `main` |
| Nov 3, night | CP1 sell path | Real listing → real policy → negotiation stub → real PayPal sale + payout |
| Nov 6, night | CP2 rental path | Real negotiator + authorize + Inspector + partial capture, on Render |
| Nov 7 | **Gate** | Full demo run on the hosted build with no mocks. If it fails, no stretch work. |
| Nov 10, night | Feature freeze | Only bug fixes after this |
| Nov 12, 11 PM | Submit | Repo, video, Devpost text, hosted URL |

## Definition of done (every task)

1. Typecheck, lint and tests pass.
2. Works with mocks AND with real keys.
3. Uses only contract types at module boundaries.
4. No floor or auto-accept value reachable by any LLM call (grep check in CI: `floorCents` must not appear in `lib/agents/**` or in any prompt file).
5. A one-line entry in `NOTES/changelog.md`.
