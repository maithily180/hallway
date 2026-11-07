"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "@/components/ui";
import { cx } from "@/components/ui/format";
import { activeTab, TABS } from "./nav";

type Badges = Record<string, number>;

function Badge({ count, className }: { count?: number; className?: string }) {
  if (!count) return null;
  return (
    <span
      aria-label={count === 1 ? "1 new request" : `${count} new requests`}
      className={cx(
        "flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[10px] font-semibold leading-none text-accent-foreground tabular-nums",
        className,
      )}
    >
      {count > 9 ? "9+" : count}
    </span>
  );
}

/** Bottom tabs on phones. */
export function TabBar({ badges = {} }: { badges?: Badges }) {
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
              <span className="relative">
                <Icon name={t.icon} className={cx("size-[22px]", active === t.href && "stroke-[2.2]")} />
                <Badge count={badges[t.href]} className="absolute -right-2.5 -top-1.5 ring-2 ring-surface" />
              </span>
              {t.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/** Inline tabs in the top bar on wider screens. */
export function TopNav({ badges = {} }: { badges?: Badges }) {
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
          <Badge count={badges[t.href]} />
        </Link>
      ))}
    </nav>
  );
}
