import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { buttonClass, Chip, EmptyState, Icon, ItemThumb, PriceTag, SectionHeader, Stat } from "@/components/ui";
import { demandTips, getListingStore, getWantStore, wantsForOwner } from "@/lib/agents";
import { DEFAULT_COMMUNITY_ID, personName } from "@/lib/agents/listings";
import { SESSION_COOKIE, verifySession } from "@/lib/auth/session";
import { StuffCalendar } from "./StuffCalendar";

export const metadata = { title: "My Stuff · Hallway" };

const MODE_LABEL = { sell: "For sale", rent: "For rent", lend: "Free to borrow" } as const;

export default async function StuffPage() {
  const user = await verifySession((await cookies()).get(SESSION_COOKIE)?.value);
  if (!user) redirect("/login?next=/stuff");

  const listings = await getListingStore().list(DEFAULT_COMMUNITY_ID);
  const wants = await getWantStore().list(DEFAULT_COMMUNITY_ID);
  const mine = listings.filter((l) => l.ownerId === user.id);
  const tips = demandTips(listings, wants, user.id);
  const asks = wantsForOwner(listings, wants, user.id);
  const lookers = tips.reduce((s, t) => s + t.count, 0);

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-8 px-4 py-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold">My Stuff</h1>
          <p className="text-muted">Your listings, who wants them and when they&apos;re out.</p>
        </div>
        <Link href="/sell" className={buttonClass("primary", "md")}>
          <Icon name="plus" className="size-4" /> List something
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Stat label="Listed" value={mine.length} icon="box" />
        <Stat label="People looking" value={lookers} icon="users" />
        <Stat label="Open requests" value={asks.length} icon="list" className="col-span-2 sm:col-span-1" />
      </div>

      {(tips.length > 0 || asks.length > 0) && (
        <section className="flex flex-col gap-3">
          {tips.map((t) => (
            <div key={t.listingId} className="flex items-start gap-3 rounded-2xl border border-accent/30 bg-accent-soft/60 p-4 text-sm">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground">
                <Icon name="trend" className="size-4" />
              </span>
              <span>
                <span className="block font-medium">Demand scout</span>
                {t.text}
              </span>
            </div>
          ))}
          {asks.length > 0 && (
            <div className="flex flex-col gap-2 rounded-2xl border border-border bg-surface p-4 text-sm shadow-sm">
              <p className="font-medium">Someone could use your stuff</p>
              {asks.map((w) => (
                <p key={w.id} className="text-muted">
                  <span className="text-foreground">{personName(w.userId)}</span> asked: &ldquo;{w.text}&rdquo;
                </p>
              ))}
            </div>
          )}
        </section>
      )}

      <section className="flex flex-col gap-4">
        <SectionHeader title="Your listings" />
        {mine.length === 0 ? (
          <EmptyState
            title="You haven't listed anything yet"
            body="Snap a photo and Hallway drafts and prices it."
            action={
              <Link href="/sell" className={buttonClass("primary", "sm")}>
                List an item
              </Link>
            }
          />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {mine.map((l) => (
              <Link
                key={l.id}
                href={`/matches/${l.id}`}
                className="group flex gap-3 rounded-2xl border border-border bg-surface p-3 shadow-sm transition hover:shadow-md"
              >
                <ItemThumb category={l.category} photo={l.photos[0]} alt={l.title} className="size-20 shrink-0 rounded-xl" />
                <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                  <div className="flex items-start justify-between gap-2">
                    <p className="line-clamp-1 font-medium group-hover:underline">{l.title}</p>
                    <Chip tone={l.status === "active" ? "success" : "neutral"} className="capitalize">
                      {l.status}
                    </Chip>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {l.modes.map((m) => (
                      <Chip key={m} tone="outline">
                        {MODE_LABEL[m]}
                      </Chip>
                    ))}
                  </div>
                  <div className="mt-auto flex gap-4 text-sm">
                    {l.rentPerDayCents !== undefined && <PriceTag cents={l.rentPerDayCents} per="day" />}
                    {l.salePriceCents !== undefined && <PriceTag cents={l.salePriceCents} />}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

      {mine.length > 0 && <StuffCalendar ownerId={user.id} items={mine.map((l) => ({ id: l.id, title: l.title }))} />}
    </main>
  );
}
