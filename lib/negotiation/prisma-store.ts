import type { Prisma } from '@prisma/client';
import {
  NegoMessageSchema,
  NegotiationSchema,
  PolicySchema,
  type ListingMode,
  type NegoMessage,
  type Negotiation,
  type Policy,
} from '@/lib/contracts';
import { db } from '@/lib/db';
import type { NegotiationStore } from './store';

const nullToUndef = <T extends object>(row: T) =>
  Object.fromEntries(Object.entries(row).map(([k, v]) => [k, v === null ? undefined : v]));

const toPolicy = (row: Prisma.PolicyGetPayload<object>): Policy =>
  PolicySchema.parse({ ...nullToUndef(row), deadline: row.deadline?.toISOString() });

const toNegotiation = (row: Prisma.NegotiationGetPayload<object>): Negotiation =>
  NegotiationSchema.parse(nullToUndef(row));

const toMessage = (row: Prisma.NegoMessageGetPayload<object>): NegoMessage =>
  NegoMessageSchema.parse({ ...nullToUndef(row), createdAt: row.createdAt.toISOString() });

export const prismaStore: NegotiationStore = {
  async getListingInfo(listingId) {
    const l = await db.listing.findUnique({ where: { id: listingId } });
    if (!l) return null;
    return {
      ownerId: l.ownerId,
      modes: l.modes as ListingMode[],
      depositCents: l.depositCents ?? 0,
      salePriceCents: l.salePriceCents ?? undefined,
      rentPerDayCents: l.rentPerDayCents ?? undefined,
    };
  },
  async listNegotiationsFor(userId) {
    const owned = await db.listing.findMany({ where: { ownerId: userId }, select: { id: true } });
    const rows = await db.negotiation.findMany({
      where: { OR: [{ buyerId: userId }, { listingId: { in: owned.map((l) => l.id) } }] },
    });
    return rows.map(toNegotiation);
  },
  async getPolicy(listingId) {
    const row = await db.policy.findUnique({ where: { listingId } });
    return row ? toPolicy(row) : null;
  },
  async upsertPolicy(policy) {
    const data = { ...policy, deadline: policy.deadline ? new Date(policy.deadline) : null };
    const row = await db.policy.upsert({
      where: { listingId: policy.listingId },
      create: data,
      update: data,
    });
    return toPolicy(row);
  },
  async createNegotiation(input) {
    return toNegotiation(await db.negotiation.create({ data: input }));
  },
  async getNegotiation(id) {
    const row = await db.negotiation.findUnique({ where: { id } });
    return row ? toNegotiation(row) : null;
  },
  async updateNegotiation(id, patch) {
    return toNegotiation(await db.negotiation.update({ where: { id }, data: patch }));
  },
  async addMessage(msg) {
    const { parsedOffer, ...rest } = msg;
    return toMessage(
      await db.negoMessage.create({
        data: { ...rest, parsedOffer: parsedOffer ?? undefined },
      }),
    );
  },
  async listMessages(negotiationId) {
    const rows = await db.negoMessage.findMany({
      where: { negotiationId },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map(toMessage);
  },
};
