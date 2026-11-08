import { NextResponse } from 'next/server';
import { z } from 'zod';
import { errorResponse, requireUserId } from '@/lib/negotiation/http';
import { getNegotiationService } from '@/lib/negotiation/runtime';

const Body = z.object({ decision: z.enum(['accept', 'decline']) });

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const userId = await requireUserId(req);
    const { id } = await ctx.params;
    const { decision } = Body.parse(await req.json());
    const service = await getNegotiationService();
    return NextResponse.json(await service.sellerDecision(id, decision, userId));
  } catch (err) {
    return errorResponse(err);
  }
}
