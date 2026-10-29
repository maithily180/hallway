import type { HTMLAttributes } from "react";
import { cx } from "./format";

type Tone = "neutral" | "accent" | "success" | "danger";

const tones: Record<Tone, string> = {
  neutral: "bg-border/60 text-foreground",
  accent: "bg-accent/15 text-accent",
  success: "bg-success/15 text-success",
  danger: "bg-danger/15 text-danger",
};

export function Chip({ tone = "neutral", className, ...props }: HTMLAttributes<HTMLSpanElement> & { tone?: Tone }) {
  return (
    <span
      className={cx("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium", tones[tone], className)}
      {...props}
    />
  );
}
