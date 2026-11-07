import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { buttonClass, Chip, EmptyState, Icon, ItemThumb, PriceTag } from "@/components/ui";
import { adviseForMatches, findMatches, getListingStore, ownerName, parseWant, recordWant } from "@/lib/agents";
import { SESSION_COOKIE, verifySession } from "@/lib/auth/session";
import { AdviceCard } from "./AdviceCard";
import { MatchActions } from "./MatchActions";

export const metadata = { title: "Matches · Hallway" };

const INTENT_LABEL = { buy: "Buy", rent: "Rent", borrow: "Borrow" } as const;

/** Splits the matcher's reason line into short facts; price comes first. */
function reasonParts(reason: string): string[] {
  return reason
    .split(" · ")
    .map((s) => s.trim())
    .filter(Boolean);
}

export default async function MatchesPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const q = (await searchParams).q?.trim();
  if (!q) redirect("/home");
  const user = await verifySession((await cookies()).get(SESSION_COOKIE)?.value);
  if (!user) redirect(`/login?next=${encodeURIComponent(`/matches?q=${q}`)}`);

  const want = await parseWant(q, user.id);
  const matches = await findMatches(want);
  await recordWant(want, matches.length > 0);
  const advice = await adviseForMatches(want, matches);
  const store = getListingStore();
  const rows = await Promise.all(matches.map(async (m) => ({ match: m, listing: (await store.get(m.listingId))! })));
  const { parsed } = want;

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-8">
      <div className="flex flex-col gap-3">
        <Link href="/home" className="flex w-fit items-center gap-1 text-sm text-muted hover:text-foreground">
          <Icon name="arrowLeft" className="size-4" /> New request
        </Link>
        <h1 className="text-2xl font-semibold sm:text-3xl">&ldquo;{q}&rdquo;</h1>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium uppercase tracking-wide text-muted">Understood as</span>
          <Chip tone="accent">{INTENT_LABEL[parsed.intent]}</Chip>
          <Chip>{parsed.item}</Chip>
          {parsed.budgetCents !== undefined && (
            <Chip>
              under <PriceTag cents={parsed.budgetCents} className="font-medium" />
            </Chip>
          )}
          {parsed.needs.map((n) => (
            <Chip key={n}>needs {n}</Chip>
          ))}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_340px] lg:items-start">
        <section className="flex flex-col gap-3">
          {rows.length === 0 ? (
            <EmptyState
              title="Nothing on campus matches yet"
              body="Your request is on the Wanted board, and owners of a match will see it."
              action={
                <Link href="/wanted" className={buttonClass("secondary", "sm")}>
                  See the Wanted board
                </Link>
              }
            />
          ) : (
            rows.map(({ match, listing }, i) => {
              const [price, ...facts] = reasonParts(match.reason);
              return (
                <article
                  key={match.listingId}
                  className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-4 shadow-sm sm:flex-row"
                >
                  <Link href={`/matches/${listing.id}`} className="shrink-0">
                    <ItemThumb
                      category={listing.category}
                      photo={listing.photos[0]}
                      alt={listing.title}
                      className="aspect-[4/3] w-full rounded-xl sm:aspect-square sm:w-32"
                    />
                  </Link>
                  <div className="flex min-w-0 flex-1 flex-col gap-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="mb-1.5 flex flex-wrap gap-1.5">
                          {i === 0 && <Chip tone="success">Best match</Chip>}
                          <Chip tone="outline">{Math.round(match.score * 100)}% match</Chip>
                        </div>
                        <Link href={`/matches/${listing.id}`} className="font-semibold hover:underline">
                          {listing.title}
                        </Link>
                        <p className="text-sm text-muted">from {ownerName(listing.ownerId)}</p>
                      </div>
                      {match.mode === "lend" ? (
                        <span className="text-lg font-semibold">Free</span>
                      ) : (
                        <PriceTag cents={match.priceCents} per={match.mode === "rent" ? "day" : undefined} className="text-lg" />
                      )}
                    </div>
                    <ul className="flex flex-col gap-1 text-sm">
                      <li className="text-muted">{price}</li>
                      {facts.map((f) => (
                        <li key={f} className="flex items-center gap-1.5">
                          <Icon name="check" className="size-4 text-success" />
                          {f}
                        </li>
                      ))}
                    </ul>
                    <div className="sm:max-w-56">
                      <MatchActions listingId={listing.id} mode={match.mode} available={match.available} />
                    </div>
                  </div>
                </article>
              );
            })
          )}
        </section>
        {advice && (
          <aside className="lg:sticky lg:top-20">
            <AdviceCard advice={advice} />
          </aside>
        )}
      </div>
    </main>
  );
}
