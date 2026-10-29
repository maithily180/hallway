import { NextResponse } from 'next/server';
import { currentUserId, errorResponse } from '@/lib/negotiation/http';
import { getNegotiationService } from '@/lib/negotiation/runtime';

/** Theater data. `floorCents` is present only when the caller is the listing owner. */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const service = await getNegotiationService();
    return NextResponse.json(await service.getTheaterView(id, currentUserId(req)));
  } catch (err) {
    return errorResponse(err);
  }
}
