import type { ReactNode } from "react";
import { cx } from "./format";
import { Icon, type IconName } from "./Icon";

/** Small labelled number tile. */
export function Stat({ label, value, icon, className }: { label: string; value: ReactNode; icon?: IconName; className?: string }) {
  return (
    <div className={cx("flex flex-col gap-1 rounded-2xl border border-border bg-surface p-4 shadow-sm", className)}>
      <span className="flex items-center gap-1.5 text-xs font-medium text-muted">
        {icon && <Icon name={icon} className="size-4" />}
        {label}
      </span>
      <span className="text-2xl font-semibold tabular-nums tracking-tight">{value}</span>
    </div>
  );
}

export function SectionHeader({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <div className="flex items-end justify-between gap-3">
      <h2 className="text-lg font-semibold">{title}</h2>
      {action}
    </div>
  );
}
