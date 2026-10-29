# Hallway

**Marketplaces find you someone to deal with. Hallway does the deal.**

Hallway is an AI agent that runs the whole deal for things your campus already owns: it lists, prices, matches, negotiates, rents and settles, while PayPal holds and moves the money. You set your floor once; the agent haggles for you; PayPal makes rentals and deposits safe.

Built for the [PayPal AI Hackathon](https://paypalaihackathon.devpost.com/). US campus, USD, PayPal sandbox.

> **Status:** work in progress during the submission period (started Oct 30, 2026). The money, deal and negotiation engine is built and tested; listings, the Lister/Pricer/Matcher/Inspector agents and the rest of the UI are being built in parallel.

## The idea in one story

Maya lists a projector and tells Hallway never to go below $25. Leo asks for "a projector tomorrow night under $35". He offers $15, then tries to trick the bot into revealing her minimum. Hallway holds its price, closes at $28, and PayPal authorizes **$28 rent + $150 deposit as one hold**. On return the Inspector compares photos, Hallway captures **only the $28**, and PayPal releases the rest of the hold.

## What makes it different

1. **PayPal is the state machine, not a button.** A rental is one authorization for rent + deposit. On return we capture only what is owed with `final_capture: true`; the rest is released. Sellers are paid out through PayPal Payouts.
2. **The floor lives in code, not in a prompt.** The model reads, reasons and writes; deterministic code decides prices and what executes. The seller's floor and auto-accept are never placed in any model's context, and every reply is checked so it can only mention the engine's chosen price.
3. **Provable.** A test suite throws 50 attack prompts (reveal the minimum, ignore instructions, fake seller approval, "I already paid", role-play, obfuscation) at a deliberately hostile stand-in model, in three negotiation states. The floor holds in all 150 runs.

## How it works

```
buyer message
   │
   ▼
Deal guard (regex scan: injection, off-platform payment, overpay scams)   ← flagged = model never sees it
   │
   ▼
Parser (LLM, buyer text only) → { offerCents, intent }
   │
   ▼
decide()  ← pure code: concession curve, floor, auto-accept, rounds, deadline
   │
   ▼
Phraser (LLM, sees PolicyView + the chosen price only)
   │
   ▼
Outgoing check ← any amount ≠ the engine's price blocks the reply (digits, words, cents)
   │
   ▼
agreed → Deal (state machine) → PayPal order → webhooks → settle
```

| Layer | Choice |
| --- | --- |
| App | Next.js (App Router), TypeScript strict, Tailwind, pnpm |
| Data | Postgres + pgvector, Prisma (on Render) |
| Payments | PayPal sandbox: Orders v2, Payments v2 (authorizations), Payouts v1, Webhooks, JS SDK |
| AI | One vision-capable Claude model with tool calling, behind `lib/llm` |
| Tests | Vitest |

### Deal states

```
sale:  AGREED → AWAITING_PAYMENT → PAID → SETTLED        (PAID → REFUNDED)
rent:  AGREED → AWAITING_PAYMENT → HELD → OUT → RETURNED → SETTLED
                                     HELD → VOIDED        (cancel before pickup)
                                     RETURNED → CLAIMED → SETTLED   (deduction agreed)
```

Only `lib/engine/transition.ts` changes a deal's state. Every PayPal call sends `PayPal-Request-Id = ${dealId}:${step}`, so retries and double-clicks never act twice.

## Run it

Requires Node 22+ and [pnpm](https://pnpm.io).

```bash
pnpm install
cp .env.example .env
MOCK_PAYPAL=1 MOCK_LLM=1 NEXT_PUBLIC_MOCK_PAYPAL=1 pnpm dev
```

That is the **mock mode**: no keys and no database. The app uses an in-memory store seeded with the demo projector, a scripted negotiator and an in-memory PayPal that behaves like the sandbox (a final capture releases the rest of a hold, you cannot capture more than was authorized, and a repeated request id returns the original result).

Try the demo script with `curl` (the `x-user-id` header stands in for login until it lands):

```bash
curl -X POST localhost:3000/api/negotiations -H 'Content-Type: application/json' -H 'x-user-id: leo' \
  -d '{"listingId":"listing-projector","kind":"rent","rentDays":1}'
# then POST /api/negotiations/<id>/messages {"text":"Would you take $15?"} ...
```

Open `/negotiate/<negotiation id>?as=maya` (owner view with the locked floor line) or `?as=leo`, and `/deals/<deal id>?as=leo` for the Deal Timeline.

### Real sandbox

1. Create a US business + two personal sandbox accounts in the [PayPal Developer Dashboard](https://developer.paypal.com/dashboard/accounts), and a Merchant app attached to the business account.
2. Fill `.env` (see below). Leave `MOCK_PAYPAL=0`.
3. `pnpm db:deploy` against your Postgres, then `pnpm dev`.
4. Walk every money call by hand with `pnpm spike <token|sale|rent|void|refund|payee|payout>`. Order steps print an approve URL; log in as the buyer to approve.

### Commands

```
pnpm dev          pnpm test         pnpm typecheck    pnpm lint
pnpm db:deploy    pnpm spike <step>
```

### Environment

See [.env.example](.env.example). Key variables:

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Postgres. Empty = in-memory mock store |
| `PAYPAL_CLIENT_ID` / `PAYPAL_CLIENT_SECRET` / `NEXT_PUBLIC_PAYPAL_CLIENT_ID` | Sandbox app credentials |
| `PAYPAL_WEBHOOK_ID` | From the webhook registered at `/api/webhooks/paypal` |
| `PAYPAL_PLATFORM_EMAIL` | Hallway's business account (Plan B receiver) |
| `PAYEE_MODE` | `platform` (Hallway receives, then pays the seller out) or `direct` (seller is the order payee) |
| `HANDOVER_SECRET` | Signs the rental QR codes |
| `MOCK_PAYPAL` / `MOCK_LLM` / `NEXT_PUBLIC_MOCK_PAYPAL` | Run without keys |
| `ANTHROPIC_API_KEY` | The model behind `lib/llm` |

### Deploy (Render)

`render.yaml` is a Blueprint: a Node web service plus Postgres 16. In Render choose **New → Blueprint**, pick the repo, and fill the `sync: false` secrets. The build runs `prisma migrate deploy` (the first migration enables `pgvector`). After the first deploy, register `https://<your-app>/api/webhooks/paypal` in the PayPal dashboard and set `PAYPAL_WEBHOOK_ID`.

## Sandbox test logins

Buyer (Leo) and seller (Maya) are US personal sandbox accounts; their emails and passwords are listed in the PayPal Developer Dashboard under Sandbox → Accounts. They are not stored in this repo.

## PayPal APIs used

| API | Used for |
| --- | --- |
| Orders v2 (`CAPTURE`, `AUTHORIZE`) | Sale checkout; rental authorization of rent + deposit |
| Payments v2: capture (`final_capture`), void, reauthorize, refund | Partial capture on return, cancel before pickup, 3-day honor period refresh, refunds |
| Payouts v1 | Paying sellers out (PayPal, or Venmo with `recipient_wallet: VENMO`, US only) |
| Webhooks | `PAYMENT.AUTHORIZATION.*`, `PAYMENT.CAPTURE.*`, payout batch events; signature verified and deduplicated |
| JavaScript SDK | The checkout button |

## AI models

An Anthropic Claude model (vision + tool calling) via `lib/llm`, used to parse buyer messages, phrase replies, build listings from photos and compare handover/return photos. It never calls PayPal and never sees the seller's floor.

## Tests

`pnpm test` runs the engine state machine, the PayPal mock, the negotiation decision function (including the demo script and a floor invariant over thousands of random offers), the services, and the 50-attack injection suite in `tests/negotiation/injection.test.ts`.

## Sponsor tools

Bryntum Scheduler (rental calendar), Channel3 (new-price anchors) and Render (hosting) are used where noted above; Bryntum and Channel3 land with the listings and calendar work.

## License

MIT. See [LICENSE](LICENSE).
