"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx } from "@/components/ui/format";

const TABS = [
  { href: "/home", label: "Find", icon: "M11 4a7 7 0 1 0 4.2 12.6l4.1 4.1 1.4-1.4-4.1-4.1A7 7 0 0 0 11 4Zm0 2a5 5 0 1 1 0 10 5 5 0 0 1 0-10Z" },
  { href: "/wanted", label: "Wanted", icon: "M4 5h16v2H4V5Zm0 6h16v2H4v-2Zm0 6h10v2H4v-2Z" },
  { href: "/sell", label: "Sell", icon: "M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6V5Z" },
  { href: "/stuff", label: "My Stuff", icon: "M4 7l8-4 8 4v10l-8 4-8-4V7Zm2 1.3v7.5l5 2.5v-7.5L6 8.3Zm12 0-5 2.5v7.5l5-2.5V8.3ZM12 5.2 7.2 7.6 12 10l4.8-2.4L12 5.2Z" },
] as const;

/** Bottom tab bar for the app screens; the current screen is highlighted. */
export function TabBar() {
  const path = usePathname();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
      <ul className="mx-auto flex max-w-xl justify-around">
        {TABS.map((t) => {
          const active = path === t.href || path.startsWith(`${t.href}/`) || (t.href === "/home" && path.startsWith("/matches"));
          return (
            <li key={t.href}>
              <Link
                href={t.href}
                aria-current={active ? "page" : undefined}
                className={cx("flex flex-col items-center gap-0.5 px-4 py-2 text-xs", active ? "text-accent" : "text-muted")}
              >
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden>
                  <path d={t.icon} fillRule="evenodd" />
                </svg>
                {t.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
