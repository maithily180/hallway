import { cookies } from "next/headers";
import Link from "next/link";
import type { ReactNode } from "react";
import { Avatar, Logo } from "@/components/ui";
import { SESSION_COOKIE, verifySession } from "@/lib/auth/session";
import { LogoutButton } from "./LogoutButton";
import { TabBar, TopNav } from "./TabBar";

/** Shell for signed-in screens: sticky top bar, tabs at the bottom on phones and in the bar on desktop. */
export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await verifySession((await cookies()).get(SESSION_COOKIE)?.value);
  return (
    <div className="min-h-dvh pb-24 md:pb-12">
      <header className="sticky top-0 z-30 border-b border-border/70 bg-background/80 backdrop-blur-lg">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between gap-4 px-4">
          <Link href="/home" aria-label="Hallway home">
            <Logo />
          </Link>
          <TopNav />
          {user && (
            <div className="flex items-center gap-1">
              <span className="mr-1 hidden text-sm text-muted sm:inline">{user.name}</span>
              <Avatar name={user.name} className="size-8 text-xs" />
              <LogoutButton />
            </div>
          )}
        </div>
      </header>
      <div className="animate-rise">{children}</div>
      <TabBar />
    </div>
  );
}
