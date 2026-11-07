import type { HTMLAttributes } from "react";
import { cx } from "./format";

type Tone = "neutral" | "accent" | "success" | "danger" | "outline";

const tones: Record<Tone, string> = {
  neutral: "bg-surface-2 text-foreground",
  accent: "bg-accent-soft text-accent-strong",
  success: "bg-success-soft text-success",
  danger: "bg-danger-soft text-danger",
  outline: "border border-border bg-surface text-muted",
};

export function Chip({ tone = "neutral", className, ...props }: HTMLAttributes<HTMLSpanElement> & { tone?: Tone }) {
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap",
        tones[tone],
        className,
      )}
      {...props}
    />
  );
}
