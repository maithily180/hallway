import { NextResponse } from 'next/server';
import { z } from 'zod';
import { currentUserId, errorResponse } from '@/lib/engine/http';
import { getDealService } from '@/lib/engine/runtime';

const Body = z.object({ qrToken: z.string().min(1), beforePhotos: z.array(z.string()).min(1) });

/** The renter's QR token (buyer only). The owner posts it back to confirm handover. */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const token = await (await getDealService()).handoverToken(id, currentUserId(req));
    return NextResponse.json({ qrToken: token });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const { qrToken, beforePhotos } = Body.parse(await req.json());
    const deals = await getDealService();
    return NextResponse.json(await deals.handover(id, qrToken, beforePhotos, currentUserId(req)));
  } catch (err) {
    return errorResponse(err);
  }
}
