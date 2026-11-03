import { NextResponse } from "next/server";
import { z } from "zod";
import { findMatches, parseWant } from "@/lib/agents";
import { getSessionUser } from "@/lib/auth/session";

const Body = z.object({ text: z.string().trim().min(1).max(500) });

export async function POST(req: Request) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: "not logged in" }, { status: 401 });
  const body = Body.safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "invalid request", issues: body.error.issues }, { status: 400 });
  const want = await parseWant(body.data.text, user.id);
  return NextResponse.json({ want, matches: await findMatches(want) });
}
