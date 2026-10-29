import { z } from 'zod';

export const CONTRACT_VERSION = 1;

export type Cents = number; // integer, USD cents
export type ISODate = string; // "2026-11-04T19:00:00Z"
export type PhotoUrl = string;

const cents = z.number().int().nonnegative();
const isoDate = z.string();
const photoUrl = z.string();

export const ListingModeSchema = z.enum(['sell', 'rent', 'lend']);
export type ListingMode = z.infer<typeof ListingModeSchema>;

export const ConditionGradeSchema = z.enum(['new', 'like_new', 'good', 'fair', 'poor']);
export type ConditionGrade = z.infer<typeof ConditionGradeSchema>;

export const ListingSchema = z.object({
  id: z.string(),
  ownerId: z.string(),
  communityId: z.string(),
  title: z.string(),
  category: z.string(),
  description: z.string(),
  conditionGrade: ConditionGradeSchema,
  defects: z.array(z.string()),
  photos: z.array(photoUrl),
  modes: z.array(ListingModeSchema),
  salePriceCents: cents.optional(),
  rentPerDayCents: cents.optional(),
  depositCents: cents.optional(),
  status: z.enum(['draft', 'active', 'reserved', 'sold', 'archived']),
  createdAt: isoDate,
});
export type Listing = z.infer<typeof ListingSchema>;

// ---- Chandrani produces ----
export const ListingDraftSchema = z.object({
  title: z.string(),
  category: z.string(),
  brandModelGuess: z.string().optional(), // internal only, never shown in demo UI
  conditionGrade: ConditionGradeSchema,
  defects: z.array(z.string()),
  description: z.string(),
  missingInfo: z.array(z.string()),
  confidence: z.number().min(0).max(1),
});
export type ListingDraft = z.infer<typeof ListingDraftSchema>;

export const PriceSuggestionSchema = z.object({
  saleRangeCents: z.tuple([cents, cents]),
  fastSaleCents: cents,
  bestPriceCents: cents,
  rentPerDayCents: cents,
  depositCents: cents,
  newPriceCents: cents.optional(),
  explanation: z.string(),
});
export type PriceSuggestion = z.infer<typeof PriceSuggestionSchema>;

export const WantSchema = z.object({
  id: z.string(),
  userId: z.string(),
  text: z.string(),
  parsed: z.object({
    item: z.string(),
    intent: z.enum(['buy', 'rent', 'borrow']),
    budgetCents: cents.optional(),
    window: z.object({ start: isoDate, end: isoDate }).optional(),
    needs: z.array(z.string()),
  }),
  status: z.enum(['open', 'matched', 'closed']),
});
export type Want = z.infer<typeof WantSchema>;

export const MatchSchema = z.object({
  listingId: z.string(),
  mode: ListingModeSchema,
  priceCents: cents, // list price (sale) or per day (rent)
  score: z.number().min(0).max(1),
  reason: z.string(),
  available: z.boolean(),
});
export type Match = z.infer<typeof MatchSchema>;

export const InspectionResultSchema = z.object({
  sameItem: z.boolean(),
  newDamage: z.array(
    z.object({
      description: z.string(),
      photoIndex: z.number().int().nonnegative(),
      region: z
        .object({ x: z.number(), y: z.number(), w: z.number(), h: z.number() })
        .optional(),
    }),
  ),
  missingParts: z.array(z.string()),
  confidence: z.number().min(0).max(1),
  proposedDeductionCents: cents, // 0 if clean; always <= deposit
  summary: z.string(),
});
export type InspectionResult = z.infer<typeof InspectionResultSchema>;

// ---- Maithily produces ----
export const PolicySchema = z.object({
  listingId: z.string(),
  listPriceCents: cents,
  floorCents: cents, // NEVER sent to any LLM
  autoAcceptCents: cents, // NEVER sent to any LLM
  mode: z.enum(['full_auto', 'ask_me']),
  strategy: z.enum(['sell_fast', 'best_price', 'auto']),
  deadline: isoDate.optional(),
  maxRounds: z.number().int().positive().default(4),
  tone: z.enum(['friendly', 'brief', 'firm']),
  extrasAllowed: z.array(z.string()),
});
export type Policy = z.infer<typeof PolicySchema>;

// The ONLY policy shape any LLM may see.
export const PolicyViewSchema = PolicySchema.omit({ floorCents: true, autoAcceptCents: true });
export type PolicyView = z.infer<typeof PolicyViewSchema>;

export const ParsedOfferSchema = z.object({
  offerCents: cents.nullable(),
  conditions: z.array(z.string()),
  intent: z.enum(['offer', 'counter', 'accept', 'question', 'other']),
});
export type ParsedOffer = z.infer<typeof ParsedOfferSchema>;

export const NegotiationSchema = z.object({
  id: z.string(),
  listingId: z.string(),
  buyerId: z.string(),
  kind: z.enum(['sale', 'rent']),
  rentDays: z.number().int().positive().optional(),
  round: z.number().int().nonnegative(),
  lastCounterCents: cents.optional(),
  agreedCents: cents.optional(),
  status: z.enum(['open', 'agreed', 'needs_seller', 'declined', 'expired']),
  dealId: z.string().optional(),
});
export type Negotiation = z.infer<typeof NegotiationSchema>;

export const NegoMessageSchema = z.object({
  id: z.string(),
  negotiationId: z.string(),
  from: z.enum(['buyer', 'agent', 'seller', 'system']),
  text: z.string(),
  parsedOffer: ParsedOfferSchema.optional(),
  blockedReason: z
    .enum(['injection', 'off_platform_payment', 'price_leak', 'scam_pattern'])
    .optional(),
  createdAt: isoDate,
});
export type NegoMessage = z.infer<typeof NegoMessageSchema>;

export const DealTypeSchema = z.enum(['sale', 'rent', 'borrow']);
export type DealType = z.infer<typeof DealTypeSchema>;

export const DealStateSchema = z.enum([
  'AGREED',
  'AWAITING_PAYMENT',
  'PAID', // sale captured
  'HELD', // rent/borrow authorized
  'OUT',
  'RETURNED',
  'SETTLED',
  'VOIDED',
  'CLAIMED',
  'REFUNDED',
]);
export type DealState = z.infer<typeof DealStateSchema>;

export const DealSchema = z.object({
  id: z.string(),
  listingId: z.string(),
  buyerId: z.string(),
  sellerId: z.string(),
  type: DealTypeSchema,
  amountCents: cents, // sale price, or total rent
  depositCents: cents, // 0 for sale
  start: isoDate.optional(),
  end: isoDate.optional(),
  state: DealStateSchema,
  paypal: z.object({
    orderId: z.string().optional(),
    authorizationId: z.string().optional(),
    captureIds: z.array(z.string()),
    payoutBatchId: z.string().optional(),
  }),
  inspectionId: z.string().optional(),
  timeline: z.array(
    z.object({ state: DealStateSchema, at: isoDate, paypalRef: z.string().optional() }),
  ),
});
export type Deal = z.infer<typeof DealSchema>;

// ---- Function contracts (in-process; each has a mock) ----
export type Msg = { role: 'user' | 'assistant'; content: string };

/** Chandrani exports from `lib/agents`. */
export interface AgentsApi {
  draftListing(photos: PhotoUrl[], note: string): Promise<ListingDraft>;
  suggestPrice(
    draft: ListingDraft,
    opts: { urgency: 'low' | 'high'; communityId: string },
  ): Promise<PriceSuggestion>;
  parseWant(text: string, userId: string): Promise<Want>;
  findMatches(want: Want): Promise<Match[]>;
  inspectCondition(
    before: PhotoUrl[],
    after: PhotoUrl[],
    listing: Listing,
  ): Promise<InspectionResult>;
}

/** Chandrani exports from `lib/llm`. */
export interface LlmApi {
  json<T>(
    schema: z.ZodType<T>,
    messages: Msg[],
    opts?: { system?: string; maxTokens?: number },
  ): Promise<T>;
  vision<T>(schema: z.ZodType<T>, images: PhotoUrl[], prompt: string): Promise<T>;
  text(messages: Msg[], opts?: { system?: string; maxTokens?: number }): Promise<string>;
}

/** Maithily exports from `lib/engine` + `lib/negotiation`. */
export interface DealsApi {
  createOrUpdatePolicy(p: Policy): Promise<Policy>;
  getPolicyView(listingId: string): Promise<PolicyView>;
  startNegotiation(
    listingId: string,
    buyerId: string,
    kind: 'sale' | 'rent',
    rentDays?: number,
  ): Promise<Negotiation>;
  handleBuyerMessage(
    negotiationId: string,
    text: string,
  ): Promise<{ negotiation: Negotiation; messages: NegoMessage[] }>;
  getDeal(dealId: string): Promise<Deal>;
  listDeals(filter: { ownerId?: string; buyerId?: string; type?: DealType }): Promise<Deal[]>;
}
