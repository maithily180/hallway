import { NextResponse } from 'next/server';
import { errorResponse, requireUserId } from '@/lib/engine/http';
import { getDealService } from '@/lib/engine/runtime';

/** Before/after photos, the Inspector's findings and each side's decision. Buyer and owner only. */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const userId = await requireUserId(req);
    const { id } = await ctx.params;
    return NextResponse.json(await (await getDealService()).getInspection(id, userId));
  } catch (err) {
    return errorResponse(err);
  }
}
