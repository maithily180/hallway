import { cookies } from "next/headers";
import Link from "next/link";
import type { ReactNode } from "react";
import { Avatar } from "@/components/ui";
import { SESSION_COOKIE, verifySession } from "@/lib/auth/session";
import { LogoutButton } from "./LogoutButton";
import { TabBar } from "./TabBar";

/** Shell for signed-in screens: top bar with the user, bottom tabs. */
export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await verifySession((await cookies()).get(SESSION_COOKIE)?.value);
  return (
    <div className="min-h-dvh pb-20">
      <header className="mx-auto flex max-w-3xl items-center justify-between px-4 pt-4">
        <Link href="/home" className="font-semibold tracking-tight">
          Hallway
        </Link>
        {user && (
          <div className="flex items-center gap-3">
            <Avatar name={user.name} />
            <LogoutButton />
          </div>
        )}
      </header>
      {children}
      <TabBar />
    </div>
  );
}
