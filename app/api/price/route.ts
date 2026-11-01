import { NextResponse } from "next/server";
import { z } from "zod";
import { ListingDraftSchema } from "@/lib/contracts";
import { suggestPrice } from "@/lib/agents";

const Body = z.object({
  draft: ListingDraftSchema,
  urgency: z.enum(["low", "high"]).default("low"),
  communityId: z.string().default(""),
});

export async function POST(req: Request) {
  const body = Body.safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "invalid request", issues: body.error.issues }, { status: 400 });
  const { draft, urgency, communityId } = body.data;
  return NextResponse.json(await suggestPrice(draft, { urgency, communityId }));
}
