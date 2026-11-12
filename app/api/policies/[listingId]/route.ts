import { NextResponse } from 'next/server';
import { errorResponse, requireUserId } from '@/lib/negotiation/http';
import { getNegotiationService } from '@/lib/negotiation/runtime';

export async function PUT(req: Request, ctx: { params: Promise<{ listingId: string }> }) {
  try {
    const userId = await requireUserId(req);
    const { listingId } = await ctx.params;
    const body = await req.json();
    const service = await getNegotiationService();
    return NextResponse.json(await service.createOrUpdatePolicy({ ...body, listingId }, userId));
  } catch (err) {
    return errorResponse(err);
  }
}
