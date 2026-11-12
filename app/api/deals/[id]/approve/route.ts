import { NextResponse } from 'next/server';
import { z } from 'zod';
import { errorResponse, requireUserId } from '@/lib/engine/http';
import { getDealService } from '@/lib/engine/runtime';

const Body = z.object({ paypalOrderId: z.string().min(1) });

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const userId = await requireUserId(req);
    const { id } = await ctx.params;
    const { paypalOrderId } = Body.parse(await req.json());
    return NextResponse.json(await (await getDealService()).approve(id, paypalOrderId, userId));
  } catch (err) {
    return errorResponse(err);
  }
}
