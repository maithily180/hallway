import { NextResponse } from 'next/server';
import { z } from 'zod';
import { currentUserId, errorResponse } from '@/lib/engine/http';
import { getDealService } from '@/lib/engine/runtime';

const Body = z.object({ afterPhotos: z.array(z.string()).min(1) });

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const { afterPhotos } = Body.parse(await req.json());
    const deals = await getDealService();
    return NextResponse.json(await deals.returnItem(id, afterPhotos, currentUserId(req)));
  } catch (err) {
    return errorResponse(err);
  }
}
