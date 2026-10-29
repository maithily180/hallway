import { NextResponse } from 'next/server';
import { z } from 'zod';
import { DealTypeSchema } from '@/lib/contracts';
import { errorResponse } from '@/lib/engine/http';
import { getDealService } from '@/lib/engine/runtime';

const Query = z.object({
  ownerId: z.string().optional(),
  buyerId: z.string().optional(),
  type: DealTypeSchema.optional(),
});

export async function GET(req: Request) {
  try {
    const params = Object.fromEntries(new URL(req.url).searchParams);
    const filter = Query.parse(params);
    return NextResponse.json(await (await getDealService()).listDeals(filter));
  } catch (err) {
    return errorResponse(err);
  }
}
