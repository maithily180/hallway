import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Card, Chip, EmptyState, PriceTag } from "@/components/ui";
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

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">My Stuff</h1>
        <Link href="/sell" className="text-sm font-medium text-accent">
          + List something
        </Link>
      </div>

      {tips.map((t) => (
        <Card key={t.listingId} className="flex items-center gap-3 bg-accent/5 text-sm">
          <Chip tone="accent" className="shrink-0 whitespace-nowrap">Demand scout</Chip>
          <span>{t.text}</span>
        </Card>
      ))}
      {asks.length > 0 && (
        <Card className="flex flex-col gap-1 text-sm">
          <p className="font-medium">Someone could use your stuff</p>
          {asks.map((w) => (
            <p key={w.id} className="text-muted">
              {personName(w.userId)} asked: &ldquo;{w.text}&rdquo;
            </p>
          ))}
        </Card>
      )}

      {mine.length === 0 ? (
        <EmptyState
          title="You haven't listed anything yet"
          body="Snap a photo and Hallway drafts and prices it."
          action={<Link href="/sell" className="text-sm font-medium text-accent">List an item</Link>}
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {mine.map((l) => (
            <Card key={l.id} className="flex flex-col gap-2">
              <div className="flex items-start justify-between gap-2">
                <p className="font-medium">{l.title}</p>
                <Chip tone={l.status === "active" ? "success" : "neutral"}>{l.status}</Chip>
              </div>
              <div className="flex flex-wrap gap-2 text-sm">
                {l.modes.map((m) => (
                  <Chip key={m}>{MODE_LABEL[m]}</Chip>
                ))}
              </div>
              <div className="flex gap-4 text-sm">
                {l.rentPerDayCents !== undefined && <PriceTag cents={l.rentPerDayCents} per="day" />}
                {l.salePriceCents !== undefined && <PriceTag cents={l.salePriceCents} />}
              </div>
            </Card>
          ))}
        </div>
      )}

      {mine.length > 0 && <StuffCalendar ownerId={user.id} items={mine.map((l) => ({ id: l.id, title: l.title }))} />}
    </main>
  );
}
