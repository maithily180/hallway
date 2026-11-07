import Link from "next/link";
import type { Listing } from "@/lib/contracts";
import { Chip } from "./Chip";
import { formatCents } from "./format";
import { ItemThumb } from "./ItemThumb";

/** Image-first listing tile with the cheapest way to get the item. */
export function ListingCard({ listing, owner }: { listing: Listing; owner: string }) {
  const price =
    listing.modes.includes("lend")
      ? "Free to borrow"
      : listing.modes.includes("rent") && listing.rentPerDayCents !== undefined
        ? `${formatCents(listing.rentPerDayCents)}/day`
        : listing.salePriceCents !== undefined
          ? formatCents(listing.salePriceCents)
          : "";
  return (
    <Link
      href={`/matches/${listing.id}`}
      className="group flex flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
    >
      <ItemThumb category={listing.category} photo={listing.photos[0]} alt={listing.title} className="aspect-[4/3]" />
      <div className="flex flex-1 flex-col gap-1 p-3">
        <p className="line-clamp-1 text-sm font-medium group-hover:underline">{listing.title}</p>
        <p className="text-xs text-muted">{owner}</p>
        <div className="mt-auto flex items-center justify-between gap-2 pt-1">
          <span className="text-sm font-semibold tabular-nums">{price}</span>
          {listing.modes.includes("rent") && <Chip tone="outline">Rent</Chip>}
        </div>
      </div>
    </Link>
  );
}
