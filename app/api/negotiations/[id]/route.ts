import { NextResponse } from 'next/server';
import { errorResponse, requireUserId } from '@/lib/negotiation/http';
import { getNegotiationService } from '@/lib/negotiation/runtime';

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const userId = await requireUserId(req);
    const { id } = await ctx.params;
    const service = await getNegotiationService();
    return NextResponse.json(await service.getNegotiation(id, userId));
  } catch (err) {
    return errorResponse(err);
  }
}
