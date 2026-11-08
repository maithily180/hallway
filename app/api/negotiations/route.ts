import { NextResponse } from 'next/server';
import { z } from 'zod';
import { errorResponse, requireUserId } from '@/lib/negotiation/http';
import { getNegotiationService } from '@/lib/negotiation/runtime';

const Body = z.object({
  listingId: z.string().min(1),
  kind: z.enum(['sale', 'rent']),
  rentDays: z.number().int().positive().optional(),
});

export async function POST(req: Request) {
  try {
    const buyerId = await requireUserId(req);
    const { listingId, kind, rentDays } = Body.parse(await req.json());
    const service = await getNegotiationService();
    return NextResponse.json(await service.startNegotiation(listingId, buyerId, kind, rentDays), {
      status: 201,
    });
  } catch (err) {
    return errorResponse(err);
  }
}
