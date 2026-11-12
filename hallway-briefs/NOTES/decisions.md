# Decisions

- **Nov 8, Plan B: Hallway receives the money, then pays the seller out.** (`PAYEE_MODE=platform`, the default.)
  Spike results against the PayPal sandbox (US business app, sandbox test card as the buyer so no login is needed):
  - `AUTHORIZE` $178 then capture $28 with `final_capture: true`: completes, and a second capture on the same authorization is refused (`AUTHORIZATION_ALREADY_CAPTURED`). The $150 deposit is released.
  - Void an authorization: 200. Capture a sale: ok. Refund a capture: 201. Payouts to a seller's sandbox account: 201.
  - Third-party `payee` (Plan A) with a card: refused, `PAYEE_NOT_ENABLED_FOR_CARD_PROCESSING` (the seller's personal sandbox account cannot process card payments). Plan A with a PayPal-wallet buyer is untested; Plan B works for both, so we keep it.
  - `lib/paypal/client.ts` itself passes the same flows, plus idempotency (same `PayPal-Request-Id` returns the same capture): `tests/integration/paypal-sandbox.test.ts`.
- Nov 8: one policy per listing (one list price, per the contract). A listing offered for both rent and sale scales the policy to the mode being negotiated: the list price becomes that mode's price and the floor and auto-accept keep the same proportion of it. No contract change needed.
- Nov 8: a free loan (lend-only listing, or `kind: borrow`) starts agreed at $0. The deposit hold is optional, as in the blueprint: with a deposit it is an authorization voided on a clean return; with none there is no PayPal call at all and the borrower confirms (AGREED -> HELD for loans only).
- Nov 8: a missing item can be claimed by the owner 24 hours after the end date: OUT -> CLAIMED -> SETTLED, capturing the whole hold. Rental holds are refreshed on day 3 by `POST /api/jobs/reauthorize` (shared-secret protected; the Render cron job is optional because Render crons have no free plan).
- Nov 8: a negotiation stops accepting buyer messages after 40, because only counted rounds are limited by the policy and each message can be a model call.
- Nov 8: errors in API routes are matched by `name`, not `instanceof`: Next loads the services in more than one module graph, so `instanceof` returned false and access failures were 500s.
- Nov 8: settling takes each side's consent from who is calling (owner proposes the deduction, renter accepts or disputes that exact figure), never from the request body.
