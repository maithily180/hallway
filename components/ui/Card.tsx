import type { HTMLAttributes } from "react";
import { cx } from "./format";

/** Surface with a quiet border; `interactive` adds a hover lift for clickable cards. */
export function Card({ className, interactive, ...props }: HTMLAttributes<HTMLDivElement> & { interactive?: boolean }) {
  return (
    <div
      className={cx(
        "rounded-2xl border border-border bg-surface p-4 shadow-sm",
        interactive && "transition hover:-translate-y-0.5 hover:shadow-md",
        className,
      )}
      {...props}
    />
  );
}
