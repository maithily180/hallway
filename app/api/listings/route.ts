import { NextResponse } from "next/server";
import { ListingSchema } from "@/lib/contracts";
import { getListingStore } from "@/lib/agents";
import { DEFAULT_COMMUNITY_ID } from "@/lib/agents/listings";
import { getSessionUser } from "@/lib/auth/session";

const Body = ListingSchema.omit({ id: true, createdAt: true, ownerId: true, communityId: true });

export async function POST(req: Request) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: "not logged in" }, { status: 401 });
  const body = Body.safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "invalid request", issues: body.error.issues }, { status: 400 });
  const listing = await getListingStore().create({ ...body.data, ownerId: user.id, communityId: DEFAULT_COMMUNITY_ID });
  return NextResponse.json(listing, { status: 201 });
}
