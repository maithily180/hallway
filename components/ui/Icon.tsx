import { cx } from "./format";

/** Outline icons (24px grid, 1.8 stroke) used across the app. */
export const ICONS = {
  search: "M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14Z M20 20l-4-4",
  list: "M8 6h12 M8 12h12 M8 18h8 M4 6h.01 M4 12h.01 M4 18h.01",
  plus: "M12 5v14 M5 12h14",
  box: "M4 7l8-4 8 4v10l-8 4-8-4V7Z M4 7l8 4 8-4 M12 11v10",
  arrowLeft: "M15 6l-6 6 6 6",
  arrowRight: "M9 6l6 6-6 6",
  check: "M5 12.5l4.5 4.5L19 7",
  x: "M6 6l12 12 M18 6L6 18",
  spark: "M12 3v4 M12 17v4 M3 12h4 M17 12h4 M6 6l2.5 2.5 M15.5 15.5L18 18 M6 18l2.5-2.5 M15.5 8.5L18 6",
  shield: "M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3Z M9 12l2 2 4-4",
  lock: "M7 11V8a5 5 0 0 1 10 0v3 M5 11h14v10H5z",
  users: "M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z M3 21v-1a6 6 0 0 1 12 0v1 M16 3.5a4 4 0 0 1 0 7 M21 21v-1a6 6 0 0 0-3-5.2",
  calendar: "M4 6h16v15H4z M4 10h16 M8 3v4 M16 3v4",
  wallet: "M4 7h15a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7Zm0 0 12-4v4 M16 13h.01",
  camera: "M4 8h3l2-3h6l2 3h3v11H4z M12 17a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z",
  video: "M3 7h12v10H3z M15 10l6-3v10l-6-3",
  logout: "M15 4h4v16h-4 M10 8l-4 4 4 4 M6 12h10",
  trend: "M4 17l5-5 4 4 7-7 M14 9h6v6",
} as const;

export type IconName = keyof typeof ICONS;

export function Icon({ name, className }: { name: IconName; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cx("size-5 shrink-0", className)}
      aria-hidden
    >
      <path d={ICONS[name]} />
    </svg>
  );
}
