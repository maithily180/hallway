import { NextResponse } from "next/server";
import { getListingStore } from "@/lib/agents";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const listing = await getListingStore().get((await ctx.params).id);
  return listing ? NextResponse.json(listing) : NextResponse.json({ error: "not found" }, { status: 404 });
}
