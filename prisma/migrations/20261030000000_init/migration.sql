-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "vector";

-- CreateTable
CREATE TABLE "Community" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "emailDomain" TEXT NOT NULL,
    "pickupSpots" TEXT[],

    CONSTRAINT "Community_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "communityId" TEXT NOT NULL,
    "paypalEmail" TEXT,
    "venmoHandle" TEXT,
    "reputation" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Listing" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "communityId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "conditionGrade" TEXT NOT NULL,
    "defects" TEXT[],
    "photos" TEXT[],
    "modes" TEXT[],
    "salePriceCents" INTEGER,
    "rentPerDayCents" INTEGER,
    "depositCents" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'active',
    "embedding" vector(1536),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Listing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Policy" (
    "listingId" TEXT NOT NULL,
    "listPriceCents" INTEGER NOT NULL,
    "floorCents" INTEGER NOT NULL,
    "autoAcceptCents" INTEGER NOT NULL,
    "mode" TEXT NOT NULL,
    "strategy" TEXT NOT NULL,
    "deadline" TIMESTAMP(3),
    "maxRounds" INTEGER NOT NULL DEFAULT 4,
    "tone" TEXT NOT NULL DEFAULT 'friendly',
    "extrasAllowed" TEXT[],

    CONSTRAINT "Policy_pkey" PRIMARY KEY ("listingId")
);

-- CreateTable
CREATE TABLE "Want" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "parsed" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Want_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Negotiation" (
    "id" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "buyerId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "rentDays" INTEGER,
    "round" INTEGER NOT NULL DEFAULT 0,
    "lastCounterCents" INTEGER,
    "agreedCents" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'open',
    "dealId" TEXT,

    CONSTRAINT "Negotiation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NegoMessage" (
    "id" TEXT NOT NULL,
    "negotiationId" TEXT NOT NULL,
    "from" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "parsedOffer" JSONB,
    "blockedReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NegoMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Deal" (
    "id" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "buyerId" TEXT NOT NULL,
    "sellerId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "depositCents" INTEGER NOT NULL DEFAULT 0,
    "start" TIMESTAMP(3),
    "end" TIMESTAMP(3),
    "state" TEXT NOT NULL,
    "paypal" JSONB NOT NULL DEFAULT '{}',
    "inspectionId" TEXT,
    "timeline" JSONB NOT NULL DEFAULT '[]',

    CONSTRAINT "Deal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Inspection" (
    "id" TEXT NOT NULL,
    "dealId" TEXT NOT NULL,
    "beforePhotos" TEXT[],
    "afterPhotos" TEXT[],
    "result" JSONB,
    "ownerDecision" TEXT,
    "renterDecision" TEXT,

    CONSTRAINT "Inspection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebhookEvent" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WebhookEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Inspection_dealId_key" ON "Inspection"("dealId");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_communityId_fkey" FOREIGN KEY ("communityId") REFERENCES "Community"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Listing" ADD CONSTRAINT "Listing_communityId_fkey" FOREIGN KEY ("communityId") REFERENCES "Community"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Policy" ADD CONSTRAINT "Policy_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "Listing"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NegoMessage" ADD CONSTRAINT "NegoMessage_negotiationId_fkey" FOREIGN KEY ("negotiationId") REFERENCES "Negotiation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

