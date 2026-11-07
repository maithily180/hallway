"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "@/components/ui";
import { cx } from "@/components/ui/format";
import { activeTab, TABS } from "./nav";

/** Bottom tabs on phones. */
export function TabBar() {
  const active = activeTab(usePathname());
  return (
    <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-surface/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-lg md:hidden">
      <ul className="mx-auto grid max-w-md grid-cols-4">
        {TABS.map((t) => (
          <li key={t.href}>
            <Link
              href={t.href}
              aria-current={active === t.href ? "page" : undefined}
              className={cx(
                "flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium transition-colors",
                active === t.href ? "text-accent" : "text-muted hover:text-foreground",
              )}
            >
              <Icon name={t.icon} className={cx("size-[22px]", active === t.href && "stroke-[2.2]")} />
              {t.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/** Inline tabs in the top bar on wider screens. */
export function TopNav() {
  const active = activeTab(usePathname());
  return (
    <nav className="hidden items-center gap-1 md:flex">
      {TABS.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          aria-current={active === t.href ? "page" : undefined}
          className={cx(
            "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
            active === t.href ? "bg-surface-2 text-foreground" : "text-muted hover:text-foreground",
          )}
        >
          <Icon name={t.icon} className="size-4" />
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
