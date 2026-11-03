import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Card, Chip, EmptyState, PriceTag } from "@/components/ui";
import { adviseForMatches, findMatches, getListingStore, ownerName, parseWant, recordWant } from "@/lib/agents";
import { SESSION_COOKIE, verifySession } from "@/lib/auth/session";
import { AdviceCard } from "./AdviceCard";
import { MatchActions } from "./MatchActions";

export const metadata = { title: "Matches · Hallway" };

const INTENT_LABEL = { buy: "Buy", rent: "Rent", borrow: "Borrow" } as const;

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
    <main className="mx-auto flex max-w-xl flex-col gap-5 px-4 py-6">
      <Link href="/home" className="text-sm text-muted">
        ← New request
      </Link>
      <div className="flex flex-col gap-2">
        <h1 className="text-xl font-semibold">&ldquo;{q}&rdquo;</h1>
        <div className="flex flex-wrap gap-2">
          <Chip tone="accent">{INTENT_LABEL[parsed.intent]}</Chip>
          <Chip>{parsed.item}</Chip>
          {parsed.budgetCents !== undefined && (
            <Chip>
              under <PriceTag cents={parsed.budgetCents} className="ml-1 font-medium" />
            </Chip>
          )}
          {parsed.needs.map((n) => (
            <Chip key={n}>needs {n}</Chip>
          ))}
        </div>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          title="Nothing on campus matches yet"
          body="We'll keep your request on the Wanted board and tell owners someone is looking."
        />
      ) : (
        rows.map(({ match, listing }, i) => (
          <Card key={match.listingId} className="flex flex-col gap-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-medium">
                  {i === 0 && <Chip tone="success" className="mr-2">Best match</Chip>}
                  {listing.title}
                </p>
                <p className="text-sm text-muted">from {ownerName(listing.ownerId)}</p>
              </div>
              {match.mode === "lend" ? (
                <span className="font-semibold">Free</span>
              ) : (
                <PriceTag cents={match.priceCents} per={match.mode === "rent" ? "day" : undefined} className="text-lg" />
              )}
            </div>
            <p className="text-sm">{match.reason}</p>
            <MatchActions listingId={listing.id} mode={match.mode} available={match.available} />
          </Card>
        ))
      )}
      {advice && <AdviceCard advice={advice} />}
    </main>
  );
}
