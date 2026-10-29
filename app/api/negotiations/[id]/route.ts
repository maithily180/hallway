import { NextResponse } from 'next/server';
import { errorResponse } from '@/lib/negotiation/http';
import { getNegotiationService } from '@/lib/negotiation/runtime';

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const service = await getNegotiationService();
    return NextResponse.json(await service.getNegotiation(id));
  } catch (err) {
    return errorResponse(err);
  }
}
