import { z } from "zod";

export const CONTRACT_VERSION = 1;

export const Cents = z.number().int().nonnegative();
export const ISODate = z.string().datetime();
export const PhotoUrl = z.string().min(1);
export type Cents = z.infer<typeof Cents>;
export type ISODate = z.infer<typeof ISODate>;
export type PhotoUrl = z.infer<typeof PhotoUrl>;

export const ListingMode = z.enum(["sell", "rent", "lend"]);
export const ConditionGrade = z.enum(["new", "like_new", "good", "fair", "poor"]);
export type ListingMode = z.infer<typeof ListingMode>;
export type ConditionGrade = z.infer<typeof ConditionGrade>;

export const ListingSchema = z.object({
  id: z.string(),
  ownerId: z.string(),
  communityId: z.string(),
  title: z.string(),
  category: z.string(),
  description: z.string(),
  conditionGrade: ConditionGrade,
  defects: z.array(z.string()),
  photos: z.array(PhotoUrl),
  modes: z.array(ListingMode),
  salePriceCents: Cents.optional(),
  rentPerDayCents: Cents.optional(),
  depositCents: Cents.optional(),
  status: z.enum(["draft", "active", "reserved", "sold", "archived"]),
  createdAt: ISODate,
});
export type Listing = z.infer<typeof ListingSchema>;

// ---- Chandrani produces ----

export const ListingDraftSchema = z.object({
  title: z.string(),
  category: z.string(),
  brandModelGuess: z.string().optional(),
  conditionGrade: ConditionGrade,
  defects: z.array(z.string()),
  description: z.string(),
  missingInfo: z.array(z.string()),
  confidence: z.number().min(0).max(1),
});
export type ListingDraft = z.infer<typeof ListingDraftSchema>;

export const PriceSuggestionSchema = z.object({
  saleRangeCents: z.tuple([Cents, Cents]),
  fastSaleCents: Cents,
  bestPriceCents: Cents,
  rentPerDayCents: Cents,
  depositCents: Cents,
  newPriceCents: Cents.optional(),
  explanation: z.string(),
});
export type PriceSuggestion = z.infer<typeof PriceSuggestionSchema>;

export const WantSchema = z.object({
  id: z.string(),
  userId: z.string(),
  text: z.string(),
  parsed: z.object({
    item: z.string(),
    intent: z.enum(["buy", "rent", "borrow"]),
    budgetCents: Cents.optional(),
    window: z.object({ start: ISODate, end: ISODate }).optional(),
    needs: z.array(z.string()),
  }),
  status: z.enum(["open", "matched", "closed"]),
});
export type Want = z.infer<typeof WantSchema>;

export const MatchSchema = z.object({
  listingId: z.string(),
  mode: ListingMode,
  priceCents: Cents,
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
      region: z.object({ x: z.number(), y: z.number(), w: z.number(), h: z.number() }).optional(),
    }),
  ),
  missingParts: z.array(z.string()),
  confidence: z.number().min(0).max(1),
  proposedDeductionCents: Cents,
  summary: z.string(),
});
export type InspectionResult = z.infer<typeof InspectionResultSchema>;

// ---- Maithily produces ----

export const PolicySchema = z.object({
  listingId: z.string(),
  listPriceCents: Cents,
  floorCents: Cents, // NEVER sent to any LLM
  autoAcceptCents: Cents, // NEVER sent to any LLM
  mode: z.enum(["full_auto", "ask_me"]),
  strategy: z.enum(["sell_fast", "best_price", "auto"]),
  deadline: ISODate.optional(),
  maxRounds: z.number().int().positive().default(4),
  tone: z.enum(["friendly", "brief", "firm"]),
  extrasAllowed: z.array(z.string()),
});
export type Policy = z.infer<typeof PolicySchema>;

// The ONLY policy shape any LLM may see.
export const PolicyViewSchema = PolicySchema.omit({ floorCents: true, autoAcceptCents: true }).strict();
export type PolicyView = z.infer<typeof PolicyViewSchema>;

export const ParsedOfferSchema = z.object({
  offerCents: Cents.nullable(),
  conditions: z.array(z.string()),
  intent: z.enum(["offer", "counter", "accept", "question", "other"]),
});
export type ParsedOffer = z.infer<typeof ParsedOfferSchema>;

export const NegotiationSchema = z.object({
  id: z.string(),
  listingId: z.string(),
  buyerId: z.string(),
  kind: z.enum(["sale", "rent"]),
  rentDays: z.number().int().positive().optional(),
  round: z.number().int().nonnegative(),
  lastCounterCents: Cents.optional(),
  agreedCents: Cents.optional(),
  status: z.enum(["open", "agreed", "needs_seller", "declined", "expired"]),
  dealId: z.string().optional(),
});
export type Negotiation = z.infer<typeof NegotiationSchema>;

export const NegoMessageSchema = z.object({
  id: z.string(),
  negotiationId: z.string(),
  from: z.enum(["buyer", "agent", "seller", "system"]),
  text: z.string(),
  parsedOffer: ParsedOfferSchema.optional(),
  blockedReason: z.enum(["injection", "off_platform_payment", "price_leak", "scam_pattern"]).optional(),
  createdAt: ISODate,
});
export type NegoMessage = z.infer<typeof NegoMessageSchema>;

export const DealType = z.enum(["sale", "rent", "borrow"]);
export const DealState = z.enum([
  "AGREED",
  "AWAITING_PAYMENT",
  "PAID",
  "HELD",
  "OUT",
  "RETURNED",
  "SETTLED",
  "VOIDED",
  "CLAIMED",
  "REFUNDED",
]);
export type DealType = z.infer<typeof DealType>;
export type DealState = z.infer<typeof DealState>;

export const DealSchema = z.object({
  id: z.string(),
  listingId: z.string(),
  buyerId: z.string(),
  sellerId: z.string(),
  type: DealType,
  amountCents: Cents,
  depositCents: Cents,
  start: ISODate.optional(),
  end: ISODate.optional(),
  state: DealState,
  paypal: z.object({
    orderId: z.string().optional(),
    authorizationId: z.string().optional(),
    captureIds: z.array(z.string()),
    payoutBatchId: z.string().optional(),
  }),
  inspectionId: z.string().optional(),
  timeline: z.array(z.object({ state: DealState, at: ISODate, paypalRef: z.string().optional() })),
});
export type Deal = z.infer<typeof DealSchema>;

// ---- LLM message shape shared by lib/llm callers ----

export const MsgSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string(),
});
export type Msg = z.infer<typeof MsgSchema>;
