import { NextResponse } from 'next/server';
import { currentUserId, errorResponse } from '@/lib/engine/http';
import { getDealService } from '@/lib/engine/runtime';

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    return NextResponse.json(await (await getDealService()).pay(id, currentUserId(req)));
  } catch (err) {
    return errorResponse(err);
  }
}
