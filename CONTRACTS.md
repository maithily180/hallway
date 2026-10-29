# Hallway — shared contracts v1

Frozen on Oct 30 in a 2-hour session between Maithily and Chandrani. This file becomes `lib/contracts/index.ts` (types + zod schemas) and `prisma/schema.prisma`. Any change = a PR labelled `contract`, approved by both, with `CONTRACT_VERSION` bumped.

The point of this file: each person can build against the other's module **before it exists**, using the mock, and the real thing drops in without edits.

## 1. Core types (`lib/contracts/index.ts`)

```ts
export const CONTRACT_VERSION = 1;

export type Cents = number;               // integer, USD cents
export type ISODate = string;             // "2026-11-04T19:00:00Z"
export type PhotoUrl = string;

export type ListingMode = 'sell' | 'rent' | 'lend';
export type ConditionGrade = 'new' | 'like_new' | 'good' | 'fair' | 'poor';

export interface Listing {
  id: string;
  ownerId: string;
  communityId: string;
  title: string;
  category: string;                       // free text, e.g. "projector"
  description: string;
  conditionGrade: ConditionGrade;
  defects: string[];
  photos: PhotoUrl[];
  modes: ListingMode[];
  salePriceCents?: Cents;
  rentPerDayCents?: Cents;
  depositCents?: Cents;
  status: 'draft' | 'active' | 'reserved' | 'sold' | 'archived';
  createdAt: ISODate;
}

// ---- Chandrani produces ----
export interface ListingDraft {           // Lister output
  title: string;
  category: string;
  brandModelGuess?: string;               // internal only, never shown in demo UI
  conditionGrade: ConditionGrade;
  defects: string[];
  description: string;
  missingInfo: string[];                  // questions to ask the seller
  confidence: number;                     // 0..1
}

export interface PriceSuggestion {        // Pricer output
  saleRangeCents: [Cents, Cents];
  fastSaleCents: Cents;
  bestPriceCents: Cents;
  rentPerDayCents: Cents;
  depositCents: Cents;
  newPriceCents?: Cents;                  // from Channel3, if found
  explanation: string;                    // one line, written by the LLM from computed numbers
}

export interface Want {
  id: string;
  userId: string;
  text: string;
  parsed: {
    item: string;
    intent: 'buy' | 'rent' | 'borrow';
    budgetCents?: Cents;
    window?: { start: ISODate; end: ISODate };
    needs: string[];                      // e.g. ["HDMI"]
  };
  status: 'open' | 'matched' | 'closed';
}

export interface Match {
  listingId: string;
  mode: ListingMode;
  priceCents: Cents;                      // list price (sale) or per day (rent)
  score: number;                          // 0..1
  reason: string;                         // "available tonight, includes HDMI"
  available: boolean;
}

export interface InspectionResult {
  sameItem: boolean;
  newDamage: { description: string; photoIndex: number; region?: { x: number; y: number; w: number; h: number } }[];
  missingParts: string[];
  confidence: number;                     // 0..1
  proposedDeductionCents: Cents;          // 0 if clean; always <= deposit
  summary: string;
}

// ---- Maithily produces ----
export interface Policy {
  listingId: string;
  listPriceCents: Cents;
  floorCents: Cents;                      // NEVER sent to any LLM
  autoAcceptCents: Cents;                 // NEVER sent to any LLM
  mode: 'full_auto' | 'ask_me';
  strategy: 'sell_fast' | 'best_price' | 'auto';
  deadline?: ISODate;
  maxRounds: number;                      // default 4
  tone: 'friendly' | 'brief' | 'firm';
  extrasAllowed: string[];                // "include HDMI cable"
}

// The ONLY policy shape any LLM may see.
export type PolicyView = Omit<Policy, 'floorCents' | 'autoAcceptCents'>;

export interface ParsedOffer {            // negotiator parser output
  offerCents: Cents | null;
  conditions: string[];
  intent: 'offer' | 'counter' | 'accept' | 'question' | 'other';
}

export interface Negotiation {
  id: string;
  listingId: string;
  buyerId: string;
  kind: 'sale' | 'rent';
  rentDays?: number;
  round: number;
  lastCounterCents?: Cents;
  agreedCents?: Cents;
  status: 'open' | 'agreed' | 'needs_seller' | 'declined' | 'expired';
  dealId?: string;
}

export interface NegoMessage {
  id: string;
  negotiationId: string;
  from: 'buyer' | 'agent' | 'seller' | 'system';
  text: string;
  parsedOffer?: ParsedOffer;
  blockedReason?: 'injection' | 'off_platform_payment' | 'price_leak' | 'scam_pattern';
  createdAt: ISODate;
}

export type DealType = 'sale' | 'rent' | 'borrow';
export type DealState =
  | 'AGREED' | 'AWAITING_PAYMENT'
  | 'PAID'                                // sale captured
  | 'HELD'                                // rent/borrow authorized
  | 'OUT' | 'RETURNED'
  | 'SETTLED' | 'VOIDED' | 'CLAIMED' | 'REFUNDED';

export interface Deal {
  id: string;
  listingId: string;
  buyerId: string;
  sellerId: string;
  type: DealType;
  amountCents: Cents;                     // sale price, or total rent
  depositCents: Cents;                    // 0 for sale
  start?: ISODate;
  end?: ISODate;
  state: DealState;
  paypal: { orderId?: string; authorizationId?: string; captureIds: string[]; payoutBatchId?: string };
  inspectionId?: string;
  timeline: { state: DealState; at: ISODate; paypalRef?: string }[];
}
```

State machines (enforced only in `lib/engine`):

```
sale:  AGREED -> AWAITING_PAYMENT -> PAID -> SETTLED (payout done)      | PAID -> REFUNDED
rent:  AGREED -> AWAITING_PAYMENT -> HELD -> OUT -> RETURNED -> SETTLED
                                       HELD -> VOIDED (cancel before pickup)
                                       RETURNED -> CLAIMED -> SETTLED (deduction captured)
```

## 2. Function contracts (in-process, each with a mock)

Chandrani exports from `lib/agents` (mock: `lib/agents/mock.ts`):

```ts
draftListing(photos: PhotoUrl[], note: string): Promise<ListingDraft>
suggestPrice(draft: ListingDraft, opts: { urgency: 'low' | 'high'; communityId: string }): Promise<PriceSuggestion>
parseWant(text: string, userId: string): Promise<Want>
findMatches(want: Want): Promise<Match[]>
inspectCondition(before: PhotoUrl[], after: PhotoUrl[], listing: Listing): Promise<InspectionResult>
```

Chandrani exports from `lib/llm` (used by both; mock returns fixtures):

```ts
llm.json<T>(schema: ZodSchema<T>, messages: Msg[], opts?: { system?: string; maxTokens?: number }): Promise<T>
llm.vision<T>(schema: ZodSchema<T>, images: PhotoUrl[], prompt: string): Promise<T>
llm.text(messages: Msg[], opts?): Promise<string>
```

Maithily exports from `lib/engine` + `lib/negotiation` (mock: scripted negotiation that closes at a fixed price):

```ts
createOrUpdatePolicy(p: Policy): Promise<Policy>
getPolicyView(listingId: string): Promise<PolicyView>
startNegotiation(listingId: string, buyerId: string, kind: 'sale' | 'rent', rentDays?: number): Promise<Negotiation>
handleBuyerMessage(negotiationId: string, text: string): Promise<{ negotiation: Negotiation; messages: NegoMessage[] }>
getDeal(dealId: string): Promise<Deal>
listDeals(filter: { ownerId?: string; buyerId?: string; type?: DealType }): Promise<Deal[]>
```

## 3. HTTP routes

| Method + path | Owner | Request | Response |
| --- | --- | --- | --- |
| POST `/api/listings/draft` | C | `{ photos, note }` | `ListingDraft` |
| POST `/api/price` | C | `{ draft, urgency }` | `PriceSuggestion` |
| POST `/api/listings` | C | `Listing` minus id/createdAt | `Listing` (also writes embedding) |
| GET `/api/listings/:id` | C | – | `Listing` |
| POST `/api/wants` | C | `{ text }` | `{ want: Want, matches: Match[] }` |
| GET `/api/wants/demand` | C | `?communityId` | `{ item: string; count: number }[]` |
| POST `/api/inspect` | C | `{ dealId, before, after }` | `InspectionResult` |
| PUT `/api/policies/:listingId` | M | `Policy` | `Policy` |
| POST `/api/negotiations` | M | `{ listingId, kind, rentDays? }` | `Negotiation` |
| POST `/api/negotiations/:id/messages` | M | `{ text }` | `{ negotiation, messages }` |
| GET `/api/negotiations/:id` | M | – | `{ negotiation, messages }` |
| POST `/api/deals/:id/pay` | M | – | `{ paypalOrderId }` (client opens the PayPal button) |
| POST `/api/deals/:id/approve` | M | `{ paypalOrderId }` | `Deal` (capture or authorize) |
| POST `/api/deals/:id/handover` | M | `{ qrToken, beforePhotos }` | `Deal` (state OUT) |
| POST `/api/deals/:id/return` | M | `{ afterPhotos }` | `{ deal, inspection }` (calls `inspectCondition`) |
| POST `/api/deals/:id/settle` | M | `{ deductionCents, ownerOk, renterOk }` | `Deal` |
| POST `/api/deals/:id/cancel` | M | – | `Deal` (void or refund) |
| GET `/api/deals` | M | `?ownerId&buyerId&type` | `Deal[]` (feeds Bryntum) |
| POST `/api/webhooks/paypal` | M | PayPal event | 200 |

## 4. UI hand-offs (who links to whom)

| From screen (owner) | Action | To (owner) |
| --- | --- | --- |
| Sell → Set your floor (C) | Save | `PUT /api/policies/:listingId` (M) |
| Matches (C) | "Make offer" / "Rent it" | `POST /api/negotiations` then route to `/negotiate/[id]` (M) |
| Negotiation Theater (M) | Deal agreed | route to `/deals/[id]` (M) |
| Deal return page (M) | Shows inspection | renders `<InspectionCard result={...} />` from `components/ui` (C) |
| My Stuff calendar (C) | Loads rentals | `GET /api/deals?ownerId=` (M) |

## 5. Prisma schema v1 (owner: Maithily)

```prisma
datasource db { provider = "postgresql"; url = env("DATABASE_URL"); extensions = [vector] }
generator client { provider = "prisma-client-js"; previewFeatures = ["postgresqlExtensions"] }

model Community { id String @id @default(cuid()) name String emailDomain String pickupSpots String[] users User[] listings Listing[] }

model User {
  id String @id @default(cuid())
  name String
  email String @unique
  communityId String
  community Community @relation(fields: [communityId], references: [id])
  paypalEmail String?
  venmoHandle String?
  reputation Json @default("{}")
}

model Listing {
  id String @id @default(cuid())
  ownerId String
  communityId String
  community Community @relation(fields: [communityId], references: [id])
  title String
  category String
  description String
  conditionGrade String
  defects String[]
  photos String[]
  modes String[]
  salePriceCents Int?
  rentPerDayCents Int?
  depositCents Int?
  status String @default("active")
  embedding Unsupported("vector(1536)")?
  createdAt DateTime @default(now())
  policy Policy?
}

model Policy {
  listingId String @id
  listing Listing @relation(fields: [listingId], references: [id])
  listPriceCents Int
  floorCents Int
  autoAcceptCents Int
  mode String
  strategy String
  deadline DateTime?
  maxRounds Int @default(4)
  tone String @default("friendly")
  extrasAllowed String[]
}

model Want { id String @id @default(cuid()) userId String text String parsed Json status String @default("open") createdAt DateTime @default(now()) }

model Negotiation {
  id String @id @default(cuid())
  listingId String
  buyerId String
  kind String
  rentDays Int?
  round Int @default(0)
  lastCounterCents Int?
  agreedCents Int?
  status String @default("open")
  dealId String?
  messages NegoMessage[]
}

model NegoMessage {
  id String @id @default(cuid())
  negotiationId String
  negotiation Negotiation @relation(fields: [negotiationId], references: [id])
  from String
  text String
  parsedOffer Json?
  blockedReason String?
  createdAt DateTime @default(now())
}

model Deal {
  id String @id @default(cuid())
  listingId String
  buyerId String
  sellerId String
  type String
  amountCents Int
  depositCents Int @default(0)
  start DateTime?
  end DateTime?
  state String
  paypal Json @default("{}")
  inspectionId String?
  timeline Json @default("[]")
}

model Inspection {
  id String @id @default(cuid())
  dealId String @unique
  beforePhotos String[]
  afterPhotos String[]
  result Json?
  ownerDecision String?
  renterDecision String?
}
```

## 6. Environment variables (`.env.example`, append-only)

```
DATABASE_URL=
PAYPAL_ENV=sandbox
PAYPAL_CLIENT_ID=
PAYPAL_CLIENT_SECRET=
PAYPAL_WEBHOOK_ID=
PAYPAL_PLATFORM_EMAIL=          # Plan B receiver
NEXT_PUBLIC_PAYPAL_CLIENT_ID=
ANTHROPIC_API_KEY=
EMBEDDINGS_API_KEY=
CHANNEL3_API_KEY=
STORAGE_BUCKET=
STORAGE_ACCESS_KEY=
STORAGE_SECRET_KEY=
CAMPUS_EMAIL_DOMAIN=            # e.g. demo.edu
MOCK_PAYPAL=0
MOCK_LLM=0
```

## 7. Demo fixtures both sides rely on

| Fixture | Value |
| --- | --- |
| Community | "Demo University", domain `demo.edu`, pickup spots: "Library steps", "Tower B lobby" |
| Seller | Maya, `maya@demo.edu`, sandbox personal account |
| Buyer | Leo, `leo@demo.edu`, sandbox personal account |
| Hero listing | Projector, rent $40/day, deposit $150, sale $180; policy floor $25/day, auto-accept $34, `best_price`, `maxRounds` 3 |
| Script outcome | Round 1: Leo offers $15 → counter $36. Injection attempt (no offer, round not counted) → blocked, counter held at $36. Round 2: Leo $26 → counter $30. Round 3: Leo $28 → last round and ≥ floor → agreed $28 |
