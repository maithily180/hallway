import { cookies } from "next/headers";
import Link from "next/link";
import { buttonClass, Icon, ListingCard, SectionHeader } from "@/components/ui";
import { getDemand, getListingStore } from "@/lib/agents";
import { DEFAULT_COMMUNITY_ID, ownerName } from "@/lib/agents/listings";
import { SESSION_COOKIE, verifySession } from "@/lib/auth/session";

const EXAMPLES = ["A projector tomorrow night under $35 with HDMI", "Borrow a drill this weekend", "Buy a desk lamp under $20"];

export default async function HomePage() {
  const user = await verifySession((await cookies()).get(SESSION_COOKIE)?.value);
  const listings = (await getListingStore().list(DEFAULT_COMMUNITY_ID))
    .filter((l) => l.status === "active" && l.ownerId !== user?.id)
    .slice(0, 8);
  const demand = (await getDemand(DEFAULT_COMMUNITY_ID)).slice(0, 5);
  const top = demand[0]?.count ?? 1;

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-10 px-4 py-8">
      <section className="flex flex-col gap-5">
        <div className="flex flex-col gap-1">
          <p className="text-sm font-medium text-accent">Hi {user?.name ?? "there"}</p>
          <h1 className="text-3xl font-semibold sm:text-4xl">What do you need?</h1>
          <p className="text-muted">Ask in your own words. Hallway finds it on campus and does the deal for you.</p>
        </div>
        <form action="/matches" className="flex items-center gap-2 rounded-full border border-border bg-surface p-1.5 pl-5 shadow-md focus-within:border-accent">
          <Icon name="search" className="text-muted" />
          <input
            name="q"
            required
            aria-label="What do you need?"
            placeholder="A projector tomorrow night under $35"
            className="min-w-0 flex-1 bg-transparent py-2 outline-none placeholder:text-muted/70"
          />
          <button type="submit" className={buttonClass("primary", "md", "rounded-full")}>
            Ask
          </button>
        </form>
        <div className="flex flex-wrap gap-2">
          {EXAMPLES.map((q) => (
            <Link
              key={q}
              href={`/matches?q=${encodeURIComponent(q)}`}
              className="rounded-full border border-border bg-surface px-3 py-1.5 text-sm text-muted transition-colors hover:border-accent hover:text-foreground"
            >
              {q}
            </Link>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <SectionHeader title="On campus now" action={<span className="text-sm text-muted">{listings.length} items</span>} />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {listings.map((l) => (
            <ListingCard key={l.id} listing={l} owner={ownerName(l.ownerId)} />
          ))}
        </div>
      </section>

      <div className="grid gap-4 md:grid-cols-2">
        <section className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-5 shadow-sm">
          <SectionHeader
            title="Most wanted"
            action={
              <Link href="/wanted" className="text-sm font-medium text-accent hover:underline">
                See all
              </Link>
            }
          />
          <ul className="flex flex-col gap-3">
            {demand.map((d) => (
              <li key={d.item} className="flex items-center gap-3 text-sm">
                <span className="w-24 shrink-0 capitalize">{d.item}</span>
                <span className="h-2 flex-1 overflow-hidden rounded-full bg-surface-2">
                  <span className="block h-full rounded-full bg-accent" style={{ width: `${(d.count / top) * 100}%` }} />
                </span>
                <span className="w-6 text-right tabular-nums text-muted">{d.count}</span>
              </li>
            ))}
          </ul>
        </section>
        <Link
          href="/sell"
          className="group relative flex flex-col justify-between gap-6 overflow-hidden rounded-2xl bg-foreground p-5 text-background shadow-md"
        >
          <span className="pointer-events-none absolute -right-10 -top-10 size-40 rounded-full bg-accent/40 blur-2xl" aria-hidden />
          <span className="flex size-10 items-center justify-center rounded-xl bg-background/10">
            <Icon name="camera" />
          </span>
          <span className="flex flex-col gap-1">
            <span className="text-lg font-semibold">Have something to sell or rent out?</span>
            <span className="text-sm text-background/70">Snap a photo. Hallway drafts it, prices it and negotiates for you.</span>
          </span>
          <span className="flex items-center gap-1 text-sm font-medium text-accent">
            Start listing <Icon name="arrowRight" className="size-4 transition group-hover:translate-x-0.5" />
          </span>
        </Link>
      </div>
    </main>
  );
}
