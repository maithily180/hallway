import { NextResponse } from 'next/server';
import { z } from 'zod';
import { errorResponse, requireUserId } from '@/lib/negotiation/http';
import { getNegotiationService } from '@/lib/negotiation/runtime';

const Body = z.object({ text: z.string() });

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const userId = await requireUserId(req);
    const { id } = await ctx.params;
    const { text } = Body.parse(await req.json());
    const service = await getNegotiationService();
    return NextResponse.json(await service.handleBuyerMessage(id, text, userId));
  } catch (err) {
    return errorResponse(err);
  }
}
