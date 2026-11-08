import { cookies } from "next/headers";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Avatar, Chip, Icon, ItemThumb, PriceTag } from "@/components/ui";
import { getDemand, getListingStore } from "@/lib/agents";
import { ownerName, ownerReliability } from "@/lib/agents/listings";
import { SESSION_COOKIE, verifySession } from "@/lib/auth/session";
import { MatchActions } from "../MatchActions";

const MODE_LABEL = { sell: "Buy it", rent: "Rent it", lend: "Borrow it" } as const;

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
  const owner = ownerName(listing.ownerId);

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-8">
      <Link href={mine ? "/stuff" : "/home"} className="flex w-fit items-center gap-1 text-sm text-muted hover:text-foreground">
        <Icon name="arrowLeft" className="size-4" /> {mine ? "My Stuff" : "Find"}
      </Link>

      <div className="grid gap-8 md:grid-cols-[1.1fr_1fr]">
        <div className="flex flex-col gap-2">
          {listing.photos.length > 0 ? (
            <div className="flex snap-x gap-2 overflow-x-auto rounded-2xl">
              {listing.photos.map((src, i) => (
                <ItemThumb
                  key={i}
                  category={listing.category}
                  photo={src}
                  alt={`${listing.title}, photo ${i + 1}`}
                  className="aspect-square w-full shrink-0 snap-center rounded-2xl"
                />
              ))}
            </div>
          ) : (
            <ItemThumb category={listing.category} alt={listing.title} className="aspect-[16/10] rounded-2xl md:aspect-[4/3]" />
          )}
        </div>

        <div className="flex flex-col gap-5">
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap gap-1.5">
              <Chip tone="outline" className="capitalize">
                {listing.conditionGrade.replace("_", " ")}
              </Chip>
              {!available && <Chip tone="danger">{listing.status}</Chip>}
              {wanted > 0 && (
                <Chip tone="accent">
                  <Icon name="trend" className="size-3.5" />
                  {wanted === 1 ? "1 person wants" : `${wanted} people want`} one
                </Chip>
              )}
            </div>
            <h1 className="text-2xl font-semibold sm:text-3xl">{listing.title}</h1>
            <p className="leading-relaxed text-muted">{listing.description}</p>
          </div>

          {listing.defects.length > 0 && (
            <div className="rounded-xl bg-surface-2 p-3 text-sm">
              <p className="mb-1 font-medium">Known wear</p>
              <ul className="flex flex-col gap-0.5 text-muted">
                {listing.defects.map((d) => (
                  <li key={d}>{d}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex flex-col gap-2">
            {listing.modes.map((mode) => (
              <div key={mode} className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4 shadow-sm">
                <div className="flex items-baseline justify-between gap-3">
                  <p className="font-medium">{MODE_LABEL[mode]}</p>
                  {mode === "lend" ? (
                    <span className="text-xl font-semibold">Free</span>
                  ) : (
                    <PriceTag
                      cents={(mode === "sell" ? listing.salePriceCents : listing.rentPerDayCents) ?? 0}
                      per={mode === "rent" ? "day" : undefined}
                      className="text-xl"
                    />
                  )}
                </div>
                {mode === "rent" && listing.depositCents !== undefined && (
                  <p className="flex items-center gap-1.5 text-xs text-muted">
                    <Icon name="shield" className="size-4" />
                    <PriceTag cents={listing.depositCents} className="font-medium text-foreground" /> deposit, held and
                    returned when the item comes back
                  </p>
                )}
                {!mine && <MatchActions listingId={listing.id} mode={mode} available={available} />}
              </div>
            ))}
          </div>

          <div className="flex items-center gap-3 rounded-2xl border border-border p-4">
            <Avatar name={mine ? user.name : owner} />
            <div className="text-sm">
              <p className="font-medium">{mine ? "Your listing" : owner}</p>
              <p className="text-muted">
                {mine ? "Hallway negotiates for you within your floor" : `${Math.round(ownerReliability(listing.ownerId) * 100)}% of deals on time`}
              </p>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
