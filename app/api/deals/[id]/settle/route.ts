import { NextResponse } from 'next/server';
import { z } from 'zod';
import { errorResponse, requireUserId } from '@/lib/engine/http';
import { getDealService } from '@/lib/engine/runtime';

// Each side speaks only for itself: the owner sets the deduction and ownerOk, the renter sets
// renterOk. The other side's consent is read from storage, not from this body.
const Body = z.object({
  deductionCents: z.number().int().nonnegative().default(0),
  ownerOk: z.boolean().default(false),
  renterOk: z.boolean().default(false),
});

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const userId = await requireUserId(req);
    const { id } = await ctx.params;
    const input = Body.parse(await req.json());
    return NextResponse.json(await (await getDealService()).settle(id, input, userId));
  } catch (err) {
    return errorResponse(err);
  }
}
