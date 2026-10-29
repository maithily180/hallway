import { NextResponse } from 'next/server';
import { z } from 'zod';
import { errorResponse } from '@/lib/engine/http';
import { getDealService } from '@/lib/engine/runtime';

const Body = z.object({
  deductionCents: z.number().int().nonnegative(),
  ownerOk: z.boolean(),
  renterOk: z.boolean(),
});

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const input = Body.parse(await req.json());
    return NextResponse.json(await (await getDealService()).settle(id, input));
  } catch (err) {
    return errorResponse(err);
  }
}
