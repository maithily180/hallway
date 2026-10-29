import { NextResponse } from 'next/server';
import { errorResponse } from '@/lib/engine/http';
import { getDealService } from '@/lib/engine/runtime';

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    return NextResponse.json(await (await getDealService()).getDeal(id));
  } catch (err) {
    return errorResponse(err);
  }
}
