import Link from "next/link";
import { buttonClass, EmptyState, Icon, ItemThumb, SectionHeader } from "@/components/ui";
import { getDemand, getWantStore } from "@/lib/agents";
import { DEFAULT_COMMUNITY_ID, personName } from "@/lib/agents/listings";

export const metadata = { title: "Wanted · Hallway" };

const INTENT_LABEL = { buy: "buy", rent: "rent", borrow: "borrow" } as const;

export default async function WantedPage() {
  const demand = await getDemand(DEFAULT_COMMUNITY_ID);
  const open = (await getWantStore().list(DEFAULT_COMMUNITY_ID)).filter((w) => w.status === "open").reverse();
  const top = demand[0]?.count ?? 1;

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-8 px-4 py-8">
      <div className="flex flex-col gap-1">
        <h1 className="text-3xl font-semibold">Wanted on campus</h1>
        <p className="text-muted">What people are looking for. Have one? List it and they&apos;ll see it first.</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[320px_1fr] lg:items-start">
        <section className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-5 shadow-sm">
          <SectionHeader title="Most wanted" />
          <ol className="flex flex-col gap-3">
            {demand.slice(0, 8).map((d, i) => (
              <li key={d.item} className="flex flex-col gap-1.5 text-sm">
                <span className="flex items-center justify-between">
                  <span className="capitalize">
                    <span className="mr-2 text-muted tabular-nums">{i + 1}</span>
                    {d.item}
                  </span>
                  <span className="text-muted tabular-nums">{d.count === 1 ? "1 person" : `${d.count} people`}</span>
                </span>
                <span className="h-1.5 overflow-hidden rounded-full bg-surface-2">
                  <span className="block h-full rounded-full bg-accent" style={{ width: `${(d.count / top) * 100}%` }} />
                </span>
              </li>
            ))}
          </ol>
        </section>

        <section className="flex flex-col gap-4">
          <SectionHeader title="Nobody has these yet" action={<span className="text-sm text-muted">{open.length} open</span>} />
          {open.length === 0 ? (
            <EmptyState title="Every request found a match" />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
              {open.map((w) => (
                <article key={w.id} className="flex items-center gap-3 rounded-2xl border border-border bg-surface p-3 shadow-sm">
                  <ItemThumb category={w.parsed.item} className="size-14 shrink-0 rounded-xl" />
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-1 text-sm font-medium">&ldquo;{w.text}&rdquo;</p>
                    <p className="text-xs text-muted">
                      {personName(w.userId)} wants to {INTENT_LABEL[w.parsed.intent]} a {w.parsed.item}
                    </p>
                  </div>
                  <Link href="/sell" className={buttonClass("secondary", "sm", "shrink-0")}>
                    <Icon name="plus" className="size-3.5" /> I have one
                  </Link>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
