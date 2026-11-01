import { NextResponse } from "next/server";
import { z } from "zod";
import { draftListing } from "@/lib/agents";

const Body = z.object({
  photos: z.array(z.string().min(1)).max(5),
  note: z.string().max(1000).default(""),
});

export async function POST(req: Request) {
  const body = Body.safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "invalid request", issues: body.error.issues }, { status: 400 });
  return NextResponse.json(await draftListing(body.data.photos, body.data.note));
}
