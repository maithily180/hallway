import { cx } from "./format";

export function Avatar({ name, className }: { name: string; className?: string }) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
  return (
    <span
      aria-label={name}
      className={cx(
        "inline-flex size-9 items-center justify-center rounded-full bg-accent/15 text-sm font-semibold text-accent",
        className,
      )}
    >
      {initials}
    </span>
  );
}
