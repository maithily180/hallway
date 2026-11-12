# Devpost text (draft)

Fill the bracketed items before submitting. Everything else is true of the code in this repo today.

## Name and tagline

**Hallway**: marketplaces find you someone to deal with. Hallway does the deal.

## Inspiration / the problem

Every campus is full of things people already own (projectors, drills, blazers, mini-fridges), but every small deal costs a chain of chat messages, a haggle, an awkward payment and a trust gamble. Owners refuse to lend because nothing protects them; sellers cave below what they wanted; "paid, check your app" is a scam waiting to happen. [Add the numbers from the campus survey here.]

## What it does

Hallway is an AI agent that runs the whole deal for things your campus already owns. You set a floor once and Hallway negotiates for you.

- **Sell or rent:** snap photos, get a listing and a price suggestion, and set your floor and auto-accept price.
- **Ask in plain words:** "a projector tomorrow night under $35" returns ranked matches with the reason for each.
- **The agent haggles:** the buyer negotiates in a chat, and Hallway counters in the owner's tone. A live price ladder shows every offer and counter. The owner (and only the owner) sees their floor as a locked line.
- **Borrow for free:** a lend-only item has nothing to haggle over. If the owner wants a deposit it is held as a PayPal authorization and **voided** on a clean return; with no deposit, nothing is charged at all.
- **Find your deals:** one page shows what is waiting on you (including offers the owner must OK), what is in progress and what is finished.
- **PayPal holds and moves the money:** a rental is **one PayPal authorization for rent + deposit**. At pickup the renter shows a signed QR code. On return, photos are compared; Hallway captures **only what is owed** and PayPal releases the rest. Sellers are paid out through PayPal Payouts.

## How we built it

**PayPal is the state machine, not a button.** Orders v2 (`AUTHORIZE` and `CAPTURE`), Payments v2 (partial capture with `final_capture: true`, void, reauthorize, refund), Payouts v1, Webhooks (signature verified, deduplicated), and the JavaScript SDK button. Every call carries a `PayPal-Request-Id` of `dealId:step`, so a retried webhook or a double click never acts twice. Only one function, `transition()`, changes a deal's state.

**The model reads and writes; code decides.** The seller's floor and auto-accept never enter any model's context. The negotiation core is a pure function (`decide()`); the model only parses the buyer's message into an offer and phrases the engine's chosen price. Every reply is checked before it is sent: any dollar amount other than the engine's price (digits, spelled-out words, cents) blocks the message. A deterministic deal guard flags prompt injection, off-platform payment requests and overpay-and-refund scams before the model sees them.

**Proof.** 50 attack prompts (reveal the minimum, ignore instructions, fake seller approval, "I already paid", role-play, obfuscation, base64, another language) run through the whole pipeline against a deliberately hostile stand-in model, in three negotiation states: the floor holds in all 150 runs. The PayPal client is also tested against the real sandbox: capturing $28 of a $178 authorization with `final_capture` completes and a second capture is refused (the deposit is released), retries with the same request id return the same capture, and void, refund and Payouts work.

**Stack.** Next.js (App Router, TypeScript strict, Tailwind), Postgres + pgvector with Prisma, a vision-capable LLM (free Gemini tier by default) behind one client, Vitest. Bryntum Scheduler for the owner's rental calendar. Hosted on Render.

## Challenges

- A floor written in a prompt does not hold, so we moved it into code and then proved it with an attack suite.
- A rental needs the deposit and the rent to be one decision, so we used one authorization and a partial final capture instead of two payments.
- One policy has to serve both rent and sale: when a listing is offered both ways, the owner's floor and auto-accept scale in proportion to the price of whichever mode is being negotiated.
- Letting two people consent separately: the renter must agree to the exact deduction the owner proposes, and each side's consent comes from who is calling, never from the request body.

## What we're proud of

The demo story runs for real: $15 offer, a blocked injection attempt, a close at $28, $178 held, handover by QR, photo-checked return, $28 captured, $150 released, seller paid out.

## What's next

Move-out mode payouts in one Payouts batch, a buyer agent that negotiates for the renter too, and multi-seller checkout.

## Built with

PayPal (Orders, Payments, Payouts, Webhooks, JS SDK, sandbox), Gemini, Next.js, TypeScript, Tailwind CSS, PostgreSQL, pgvector, Prisma, Vitest, Bryntum Scheduler, Render.

## Statement

This project was built during the submission period (started Oct 30, 2026).

## Try it

- Repo: [GitHub URL]
- Hosted demo: [Render URL]. Sign in with `maya@demo.edu` (owner) or `leo@demo.edu` (renter) and the demo password [DEMO_PASSWORD].
- Video: [YouTube URL]
