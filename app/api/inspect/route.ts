import { NextResponse } from "next/server";
import { z } from "zod";
import { getListingStore, inspectCondition } from "@/lib/agents";
import { getSessionUser } from "@/lib/auth/session";
import { PhotoUrl } from "@/lib/contracts";

const Body = z.object({
  dealId: z.string(),
  listingId: z.string(),
  before: z.array(PhotoUrl).min(1).max(5),
  after: z.array(PhotoUrl).min(1).max(5),
});

/** Inspector proposal for a return. Maithily's deal return route calls inspectCondition directly; this is for previews. */
export async function POST(req: Request) {
  if (!(await getSessionUser(req))) return NextResponse.json({ error: "not logged in" }, { status: 401 });
  const body = Body.safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "invalid request", issues: body.error.issues }, { status: 400 });
  const listing = await getListingStore().get(body.data.listingId);
  if (!listing) return NextResponse.json({ error: "listing not found" }, { status: 404 });
  return NextResponse.json(await inspectCondition(body.data.before, body.data.after, listing));
}
