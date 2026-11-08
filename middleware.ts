import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySession } from "@/lib/auth/session";

/** Sends signed-out visitors of app screens to /login. */
export async function middleware(req: NextRequest) {
  if (await verifySession(req.cookies.get(SESSION_COOKIE)?.value)) return NextResponse.next();
  const url = new URL("/login", req.url);
  url.searchParams.set("next", req.nextUrl.pathname);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/home/:path*", "/sell/:path*", "/matches/:path*", "/stuff/:path*", "/wanted/:path*"],
};
