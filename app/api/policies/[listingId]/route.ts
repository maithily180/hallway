import { NextResponse } from 'next/server';
import { currentUserId, errorResponse } from '@/lib/negotiation/http';
import { getNegotiationService } from '@/lib/negotiation/runtime';

export async function PUT(req: Request, ctx: { params: Promise<{ listingId: string }> }) {
  try {
    const { listingId } = await ctx.params;
    const body = await req.json();
    const service = await getNegotiationService();
    const policy = await service.createOrUpdatePolicy({ ...body, listingId }, currentUserId(req));
    return NextResponse.json(policy);
  } catch (err) {
    return errorResponse(err);
  }
}
