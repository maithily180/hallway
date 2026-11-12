import { NextResponse } from 'next/server';
import { errorResponse, requireUserId } from '@/lib/engine/http';
import { getDealService } from '@/lib/engine/runtime';

/** The owner claims the whole hold when the item is more than a day overdue. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const userId = await requireUserId(req);
    const { id } = await ctx.params;
    return NextResponse.json(await (await getDealService()).claimNoReturn(id, userId));
  } catch (err) {
    return errorResponse(err);
  }
}
