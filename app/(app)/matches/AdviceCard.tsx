import { Card, Chip, formatCents } from "@/components/ui";
import type { Advice } from "@/lib/agents/advisor";

const LABEL = { buy: "Buy", rent: "Rent", borrow: "Borrow" } as const;

/** Buy vs rent vs borrow, with the math shown. */
export function AdviceCard({ advice }: { advice: Advice }) {
  return (
    <Card className="flex flex-col gap-3 bg-accent/5">
      <div className="flex items-center gap-2">
        <h2 className="font-semibold">Buy, rent or borrow?</h2>
        <Chip tone="accent">{LABEL[advice.pick]}</Chip>
      </div>
      <p className="text-sm">{advice.summary}</p>
      <ul className="flex flex-col gap-1.5 text-sm">
        {advice.options.map((o) => (
          <li key={o.kind} className="flex items-baseline justify-between gap-3">
            <span className={o.kind === advice.pick ? "font-medium" : "text-muted"}>
              {LABEL[o.kind]}: {o.detail}
            </span>
            <span className="shrink-0 font-semibold tabular-nums">{o.costCents === 0 ? "Free" : formatCents(o.costCents)}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}
