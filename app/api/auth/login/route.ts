import { NextResponse } from "next/server";
import { z } from "zod";
import { campusEmail, SESSION_COOKIE, SESSION_TTL_SECONDS, signSession, userFromEmail } from "@/lib/auth/session";

const Body = z.object({ email: z.string(), password: z.string() });

export async function POST(req: Request) {
  const body = Body.safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "invalid request" }, { status: 400 });

  const email = campusEmail(body.data.email);
  if (!email) {
    const domain = process.env.CAMPUS_EMAIL_DOMAIN;
    return NextResponse.json({ error: domain ? `Use your @${domain} email.` : "Login is not configured." }, { status: 403 });
  }
  const demo = process.env.DEMO_PASSWORD;
  if (!demo || body.data.password !== demo) {
    return NextResponse.json({ error: "Wrong password." }, { status: 401 });
  }

  const user = userFromEmail(email);
  const res = NextResponse.json(user);
  res.cookies.set(SESSION_COOKIE, await signSession(user), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
  return res;
}
