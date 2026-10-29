import { NextResponse } from 'next/server';
import { z } from 'zod';
import { currentUserId, errorResponse } from '@/lib/negotiation/http';
import { getNegotiationService } from '@/lib/negotiation/runtime';

const Body = z.object({ decision: z.enum(['accept', 'decline']) });

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const { decision } = Body.parse(await req.json());
    const service = await getNegotiationService();
    return NextResponse.json(await service.sellerDecision(id, decision, currentUserId(req)));
  } catch (err) {
    return errorResponse(err);
  }
}
