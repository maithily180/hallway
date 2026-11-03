"use client";

import { useEffect, useRef, useState } from "react";
import { DealSchema } from "@/lib/contracts";
import { formatCents } from "@/components/ui";
import { earningsCents, rentalEvents } from "./deals";
import "./calendar.css";

type Item = { id: string; title: string };

const DAY = 86_400_000;

/** Bryntum Scheduler: each of your items is a row, rentals from GET /api/deals are events. */
export function StuffCalendar({ ownerId, items }: { ownerId: string; items: Item[] }) {
  const host = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "no-deals">("loading");
  const [earned, setEarned] = useState(0);

  useEffect(() => {
    let scheduler: { destroy(): void } | undefined;
    let cancelled = false;
    (async () => {
      const res = await fetch(`/api/deals?ownerId=${encodeURIComponent(ownerId)}`).catch(() => undefined);
      const parsed = res?.ok ? DealSchema.array().safeParse(await res.json().catch(() => null)) : undefined;
      const deals = parsed?.success ? parsed.data : [];
      const titles = new Map(items.map((i) => [i.id, i.title]));
      const { Scheduler } = await import("@bryntum/scheduler-trial");
      if (cancelled || !host.current) return;
      const today = new Date(new Date().setHours(0, 0, 0, 0));
      scheduler = new Scheduler({
        appendTo: host.current,
        height: Math.max(220, 60 + items.length * 50),
        startDate: new Date(today.getTime() - DAY),
        endDate: new Date(today.getTime() + 13 * DAY),
        viewPreset: "dayAndWeek",
        rowHeight: 48,
        readOnly: true,
        columns: [{ text: "Item", field: "name", width: 180 }],
        resources: items.map((i) => ({ id: i.id, name: i.title })),
        events: rentalEvents(deals, (id) => titles.get(id)),
      });
      setEarned(earningsCents(deals));
      setStatus(parsed?.success ? "ready" : "no-deals");
    })();
    return () => {
      cancelled = true;
      scheduler?.destroy();
    };
  }, [ownerId, items]);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between">
        <h2 className="font-semibold">Rental calendar</h2>
        <span className="text-sm text-muted">
          Earned <span className="font-semibold text-foreground tabular-nums">{formatCents(earned)}</span>
        </span>
      </div>
      <div ref={host} className="overflow-hidden rounded-2xl border border-border bg-surface" />
      {status === "no-deals" && (
        <p className="text-xs text-muted">Rentals show here once the deals service is live.</p>
      )}
    </div>
  );
}
