import { cookies } from "next/headers";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Card, Chip, PriceTag } from "@/components/ui";
import { getDemand, getListingStore } from "@/lib/agents";
import { ownerName } from "@/lib/agents/listings";
import { SESSION_COOKIE, verifySession } from "@/lib/auth/session";
import { MatchActions } from "../MatchActions";

const MODE_LABEL = { sell: "Buy", rent: "Rent", lend: "Borrow" } as const;

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const listing = await getListingStore().get((await params).id);
  return { title: `${listing?.title ?? "Item"} · Hallway` };
}

/** One listing: photos, condition, every way to get it, and how many people want one. */
export default async function ListingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await verifySession((await cookies()).get(SESSION_COOKIE)?.value);
  if (!user) redirect(`/login?next=/matches/${encodeURIComponent(id)}`);
  const listing = await getListingStore().get(id);
  if (!listing) notFound();

  const mine = listing.ownerId === user.id;
  const wanted = (await getDemand(listing.communityId)).find((d) => d.item === listing.category)?.count ?? 0;
  const available = listing.status === "active";

  return (
    <main className="mx-auto flex max-w-xl flex-col gap-5 px-4 py-6">
      <Link href={mine ? "/stuff" : "/home"} className="text-sm text-muted">
        ← {mine ? "My Stuff" : "Find"}
      </Link>

      {listing.photos.length > 0 ? (
        <div className="flex snap-x gap-2 overflow-x-auto">
          {listing.photos.map((src, i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={i} src={src} alt={`${listing.title}, photo ${i + 1}`} className="aspect-square w-4/5 shrink-0 snap-center rounded-2xl object-cover" />
          ))}
        </div>
      ) : (
        <div className="flex aspect-[4/3] items-center justify-center rounded-2xl border border-border bg-surface text-sm text-muted">
          No photos yet
        </div>
      )}

      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold">{listing.title}</h1>
        <p className="text-sm text-muted">
          {mine ? "Your listing" : `from ${ownerName(listing.ownerId)}`} · {listing.conditionGrade.replace("_", " ")} condition
        </p>
        <div className="flex flex-wrap gap-2">
          {!available && <Chip tone="danger">{listing.status}</Chip>}
          {wanted > 0 && <Chip tone="accent">{wanted === 1 ? "1 person wants" : `${wanted} people want`} one</Chip>}
        </div>
      </div>

      <p className="text-sm">{listing.description}</p>
      {listing.defects.length > 0 && (
        <ul className="text-sm text-muted">
          {listing.defects.map((d) => (
            <li key={d}>• {d}</li>
          ))}
        </ul>
      )}

      {listing.modes.map((mode) => (
        <Card key={mode} className="flex items-center justify-between gap-3">
          <div>
            <p className="font-medium">{MODE_LABEL[mode]}</p>
            {mode === "rent" && listing.depositCents !== undefined && (
              <p className="text-xs text-muted">
                <PriceTag cents={listing.depositCents} className="font-normal" /> refundable deposit
              </p>
            )}
          </div>
          <div className="flex items-center gap-3">
            {mode === "lend" ? (
              <span className="font-semibold">Free</span>
            ) : (
              <PriceTag
                cents={(mode === "sell" ? listing.salePriceCents : listing.rentPerDayCents) ?? 0}
                per={mode === "rent" ? "day" : undefined}
              />
            )}
            {!mine && <MatchActions listingId={listing.id} mode={mode} available={available} />}
          </div>
        </Card>
      ))}
    </main>
  );
}
