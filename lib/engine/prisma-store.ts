import { Prisma } from '@prisma/client';
import { DealSchema, type Deal, type InspectionResult } from '@/lib/contracts';
import { db } from '@/lib/db';
import type { DealStore, InspectionRecord } from './store';

const toDeal = (row: Prisma.DealGetPayload<object>): Deal =>
  DealSchema.parse({
    ...row,
    inspectionId: row.inspectionId ?? undefined,
    start: row.start?.toISOString(),
    end: row.end?.toISOString(),
    paypal: { captureIds: [], ...(row.paypal as object) },
  });

const toInspection = (row: Prisma.InspectionGetPayload<object>): InspectionRecord => ({
  dealId: row.dealId,
  beforePhotos: row.beforePhotos,
  afterPhotos: row.afterPhotos,
  result: (row.result as InspectionResult | null) ?? undefined,
  deductionCents: row.deductionCents ?? undefined,
  ownerDecision: (row.ownerDecision as InspectionRecord['ownerDecision']) ?? undefined,
  renterDecision: (row.renterDecision as InspectionRecord['renterDecision']) ?? undefined,
});

const toRow = (deal: Omit<Deal, 'id'>) => ({
  ...deal,
  start: deal.start ? new Date(deal.start) : null,
  end: deal.end ? new Date(deal.end) : null,
  paypal: deal.paypal as Prisma.InputJsonValue,
  timeline: deal.timeline as Prisma.InputJsonValue,
});

export const prismaDealStore: DealStore = {
  async getListingTerms(listingId) {
    const listing = await db.listing.findUnique({ where: { id: listingId } });
    if (!listing) return null;
    const owner = await db.user.findUnique({ where: { id: listing.ownerId } });
    return {
      ownerId: listing.ownerId,
      depositCents: listing.depositCents ?? 0,
      sellerPayoutEmail: owner?.paypalEmail ?? undefined,
    };
  },
  async createDeal(deal) {
    return toDeal(await db.deal.create({ data: toRow(deal) }));
  },
  async getDeal(id) {
    const row = await db.deal.findUnique({ where: { id } });
    return row ? toDeal(row) : null;
  },
  async saveDeal(deal) {
    const { id, ...rest } = deal;
    return toDeal(await db.deal.update({ where: { id }, data: toRow(rest) }));
  },
  async listDeals({ ownerId, buyerId, type, states }) {
    const rows = await db.deal.findMany({
      where: { sellerId: ownerId, buyerId, type, state: states ? { in: states } : undefined },
      orderBy: { start: 'asc' },
    });
    return rows.map(toDeal);
  },
  async findDealByPayPalId({ orderId, authorizationId, captureId, payoutBatchId }) {
    const or: Prisma.DealWhereInput[] = [];
    if (orderId) or.push({ paypal: { path: ['orderId'], equals: orderId } });
    if (authorizationId) or.push({ paypal: { path: ['authorizationId'], equals: authorizationId } });
    if (captureId) or.push({ paypal: { path: ['captureIds'], array_contains: captureId } });
    if (payoutBatchId) or.push({ paypal: { path: ['payoutBatchId'], equals: payoutBatchId } });
    if (!or.length) return null;
    const row = await db.deal.findFirst({ where: { OR: or } });
    return row ? toDeal(row) : null;
  },
  async getInspection(dealId) {
    const row = await db.inspection.findUnique({ where: { dealId } });
    return row ? toInspection(row) : null;
  },
  async saveInspection(record) {
    const data = {
      beforePhotos: record.beforePhotos,
      afterPhotos: record.afterPhotos,
      result: (record.result ?? undefined) as Prisma.InputJsonValue | undefined,
      deductionCents: record.deductionCents ?? null,
      ownerDecision: record.ownerDecision ?? null,
      renterDecision: record.renterDecision ?? null,
    };
    const row = await db.inspection.upsert({
      where: { dealId: record.dealId },
      create: { dealId: record.dealId, ...data },
      update: data,
    });
    return toInspection(row);
  },
  async recordWebhookEvent(id, type) {
    try {
      await db.webhookEvent.create({ data: { id, type } });
      return true;
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') return false;
      throw err;
    }
  },
};
