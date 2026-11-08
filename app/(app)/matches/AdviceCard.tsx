import { Chip, formatCents, Icon } from "@/components/ui";
import { cx } from "@/components/ui/format";
import type { Advice } from "@/lib/agents/advisor";

const LABEL = { buy: "Buy", rent: "Rent", borrow: "Borrow" } as const;

/** Buy vs rent vs borrow, with the math shown. */
export function AdviceCard({ advice }: { advice: Advice }) {
  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-5 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-semibold">
          <Icon name="spark" className="size-4 text-accent" /> Buy, rent or borrow?
        </h2>
        <Chip tone="accent">{LABEL[advice.pick]}</Chip>
      </div>
      <p className="text-sm leading-relaxed">{advice.summary}</p>
      <ul className="flex flex-col gap-2">
        {advice.options.map((o) => (
          <li
            key={o.kind}
            className={cx(
              "flex items-center justify-between gap-3 rounded-xl border px-3 py-2.5 text-sm",
              o.kind === advice.pick ? "border-accent bg-accent-soft/50" : "border-border",
            )}
          >
            <span className="flex flex-col">
              <span className="font-medium">{LABEL[o.kind]}</span>
              <span className="text-xs text-muted">{o.detail}</span>
            </span>
            <span className="shrink-0 font-semibold tabular-nums">{o.costCents === 0 ? "Free" : formatCents(o.costCents)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
