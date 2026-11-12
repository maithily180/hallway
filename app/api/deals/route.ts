import { NextResponse } from 'next/server';
import { z } from 'zod';
import { DealType } from '@/lib/contracts';
import { DealError } from '@/lib/engine/deals';
import { errorResponse, requireUserId } from '@/lib/engine/http';
import { getDealService } from '@/lib/engine/runtime';

const Query = z.object({
  ownerId: z.string().optional(),
  buyerId: z.string().optional(),
  type: DealType.optional(),
});

/** Deals for the signed-in user only: as owner (calendar, earnings) and/or as buyer. */
export async function GET(req: Request) {
  try {
    const userId = await requireUserId(req);
    const { ownerId, buyerId, type } = Query.parse(Object.fromEntries(new URL(req.url).searchParams));
    if ((ownerId && ownerId !== userId) || (buyerId && buyerId !== userId)) {
      throw new DealError('you can only list your own deals', 403);
    }
    const deals = await getDealService();
    if (ownerId || buyerId) return NextResponse.json(await deals.listDeals({ ownerId, buyerId, type }));

    const [asOwner, asBuyer] = await Promise.all([
      deals.listDeals({ ownerId: userId, type }),
      deals.listDeals({ buyerId: userId, type }),
    ]);
    const unique = new Map([...asOwner, ...asBuyer].map((d) => [d.id, d]));
    return NextResponse.json([...unique.values()]);
  } catch (err) {
    return errorResponse(err);
  }
}
