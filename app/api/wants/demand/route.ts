import { NextResponse } from "next/server";
import { getDemand } from "@/lib/agents";
import { DEFAULT_COMMUNITY_ID } from "@/lib/agents/listings";

export async function GET(req: Request) {
  const communityId = new URL(req.url).searchParams.get("communityId") ?? DEFAULT_COMMUNITY_ID;
  return NextResponse.json(await getDemand(communityId));
}
