import Link from "next/link";
import { Card, Chip, EmptyState } from "@/components/ui";
import { getDemand, getWantStore } from "@/lib/agents";
import { DEFAULT_COMMUNITY_ID, personName } from "@/lib/agents/listings";

export const metadata = { title: "Wanted · Hallway" };

const INTENT_LABEL = { buy: "buy", rent: "rent", borrow: "borrow" } as const;

export default async function WantedPage() {
  const demand = await getDemand(DEFAULT_COMMUNITY_ID);
  const open = (await getWantStore().list(DEFAULT_COMMUNITY_ID)).filter((w) => w.status === "open").reverse();

  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col gap-6 px-4 py-10">
      <Link href="/home" className="text-sm text-muted">
        ← Home
      </Link>
      <div>
        <h1 className="text-2xl font-semibold">Wanted on campus</h1>
        <p className="text-sm text-muted">What people are looking for. Have one? List it and they&apos;ll see it first.</p>
      </div>

      <section className="flex flex-col gap-2">
        <h2 className="font-semibold">Most wanted</h2>
        <div className="flex flex-wrap gap-2">
          {demand.slice(0, 8).map((d) => (
            <Chip key={d.item} tone={d.count >= 3 ? "accent" : "neutral"}>
              {d.item} · {d.count}
            </Chip>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-semibold">Nobody has these yet</h2>
        {open.length === 0 ? (
          <EmptyState title="Every request found a match" />
        ) : (
          open.map((w) => (
            <Card key={w.id} className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm">&ldquo;{w.text}&rdquo;</p>
                <p className="text-xs text-muted">
                  {personName(w.userId)} wants to {INTENT_LABEL[w.parsed.intent]} a{" "}
                  {w.parsed.item}
                </p>
              </div>
              <Link href="/sell" className="shrink-0 rounded-xl border border-border px-3 py-1.5 text-sm hover:border-accent">
                I have one
              </Link>
            </Card>
          ))
        )}
      </section>
    </main>
  );
}
