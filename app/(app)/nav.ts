import type { IconName } from "@/components/ui";

export const TABS: { href: string; label: string; icon: IconName }[] = [
  { href: "/home", label: "Find", icon: "search" },
  { href: "/wanted", label: "Wanted", icon: "list" },
  { href: "/sell", label: "Sell", icon: "plus" },
  { href: "/stuff", label: "My Stuff", icon: "box" },
];

/** The tab a path belongs to; listing and match pages count as Find. */
export function activeTab(path: string): string | undefined {
  if (path.startsWith("/matches")) return "/home";
  return TABS.find((t) => path === t.href || path.startsWith(`${t.href}/`))?.href;
}
