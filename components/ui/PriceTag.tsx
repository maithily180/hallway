import { cx, formatCents } from "./format";

export function PriceTag({
  cents,
  per,
  className,
}: {
  cents: number;
  /** Rental unit, e.g. "day" renders "$40/day". */
  per?: string;
  className?: string;
}) {
  return (
    <span className={cx("font-semibold tabular-nums", className)}>
      {formatCents(cents)}
      {per && <span className="text-sm font-normal text-muted">/{per}</span>}
    </span>
  );
}
