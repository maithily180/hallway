import { NextResponse } from 'next/server';
import { z } from 'zod';
import { errorResponse, requireUserId } from '@/lib/negotiation/http';
import { getNegotiationService } from '@/lib/negotiation/runtime';

// `borrow` is a free loan (deposit only): there is nothing to negotiate, so it starts agreed.
// A lend-only listing is treated as a loan even when the client says `rent`.
const Body = z.object({
  listingId: z.string().min(1),
  kind: z.enum(['sale', 'rent', 'borrow']),
  rentDays: z.number().int().positive().optional(),
});

/** Negotiations the signed-in user is part of, as buyer or as owner; `needsYou` marks "ask me" offers. */
export async function GET(req: Request) {
  try {
    const userId = await requireUserId(req);
    return NextResponse.json(await (await getNegotiationService()).listFor(userId));
  } catch (err) {
    return errorResponse(err);
  }
}

export async function POST(req: Request) {
  try {
    const buyerId = await requireUserId(req);
    const { listingId, kind, rentDays } = Body.parse(await req.json());
    const service = await getNegotiationService();
    const borrow = kind === 'borrow';
    const negotiation = await service.startNegotiation(
      listingId,
      buyerId,
      borrow ? 'rent' : kind,
      borrow ? (rentDays ?? 1) : rentDays,
      { borrow },
    );
    return NextResponse.json(negotiation, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
