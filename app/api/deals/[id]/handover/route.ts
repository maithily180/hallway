import { NextResponse } from 'next/server';
import { z } from 'zod';
import { errorResponse, requireUserId } from '@/lib/engine/http';
import { getDealService } from '@/lib/engine/runtime';

const Body = z.object({ qrToken: z.string().min(1), beforePhotos: z.array(z.string()).min(1) });

/** The renter's QR token (buyer only). The owner posts it back to confirm handover. */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const userId = await requireUserId(req);
    const { id } = await ctx.params;
    return NextResponse.json({ qrToken: await (await getDealService()).handoverToken(id, userId) });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const userId = await requireUserId(req);
    const { id } = await ctx.params;
    const { qrToken, beforePhotos } = Body.parse(await req.json());
    return NextResponse.json(await (await getDealService()).handover(id, qrToken, beforePhotos, userId));
  } catch (err) {
    return errorResponse(err);
  }
}
