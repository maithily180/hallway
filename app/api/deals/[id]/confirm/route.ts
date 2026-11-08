import { NextResponse } from 'next/server';
import { errorResponse, requireUserId } from '@/lib/engine/http';
import { getDealService } from '@/lib/engine/runtime';

/** A free loan with no deposit has nothing to pay: the borrower confirms it (no PayPal involved). */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const userId = await requireUserId(req);
    const { id } = await ctx.params;
    return NextResponse.json(await (await getDealService()).confirmLoan(id, userId));
  } catch (err) {
    return errorResponse(err);
  }
}
