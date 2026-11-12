import { cookies } from 'next/headers';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Card, Chip, EmptyState, SectionHeader, buttonClass } from '@/components/ui';
import { usd } from '@/components/deal/format';
import { getListingStore, personName } from '@/lib/agents/listings';
import { SESSION_COOKIE, verifySession } from '@/lib/auth/session';
import type { Deal, DealState } from '@/lib/contracts';
import { getDealService } from '@/lib/engine/runtime';
import { getNegotiationService } from '@/lib/negotiation/runtime';

export const dynamic = 'force-dynamic';

const ACTIVE: DealState[] = ['AGREED', 'AWAITING_PAYMENT', 'PAID', 'HELD', 'OUT', 'RETURNED', 'CLAIMED'];

const STATE_LABEL: Record<DealState, string> = {
  AGREED: 'Agreed',
  AWAITING_PAYMENT: 'Awaiting payment',
  PAID: 'Paid',
  HELD: 'Funds held',
  OUT: 'Out',
  RETURNED: 'Returned',
  SETTLED: 'Settled',
  VOIDED: 'Cancelled',
  CLAIMED: 'Under review',
  REFUNDED: 'Refunded',
};

/** What the signed-in user has to do next on a deal, if anything. */
function nextStep(deal: Deal, userId: string): string | undefined {
  const mine = userId === deal.sellerId ? 'owner' : 'buyer';
  switch (deal.state) {
    case 'AGREED':
    case 'AWAITING_PAYMENT':
      return mine === 'buyer' ? (deal.type === 'borrow' && deal.depositCents === 0 ? 'Confirm the loan' : 'Pay with PayPal') : undefined;
    case 'HELD':
      return mine === 'owner' ? 'Hand it over' : 'Show your pickup code';
    case 'OUT':
      return mine === 'buyer' ? 'Return it' : undefined;
    case 'RETURNED':
    case 'CLAIMED':
      return 'Review the return';
    default:
      return undefined;
  }
}

/** Everything you are part of: offers waiting on you, deals in progress, and what has finished. */
export default async function DealsPage() {
  const user = await verifySession((await cookies()).get(SESSION_COOKIE)?.value);
  if (!user) redirect(`/login?next=${encodeURIComponent('/deals')}`);

  const [deals, negotiations] = await Promise.all([
    (async () => {
      const service = await getDealService();
      const [asOwner, asBuyer] = await Promise.all([service.listDeals({ ownerId: user.id }), service.listDeals({ buyerId: user.id })]);
      return [...new Map([...asOwner, ...asBuyer].map((d) => [d.id, d])).values()];
    })(),
    (await getNegotiationService()).listFor(user.id),
  ]);

  const listings = getListingStore();
  const titles = new Map<string, string>();
  for (const id of new Set([...deals.map((d) => d.listingId), ...negotiations.map((r) => r.negotiation.listingId)])) {
    titles.set(id, (await listings.get(id))?.title ?? 'An item');
  }

  const needsYou = negotiations.filter((r) => r.needsYou);
  // A negotiation that already became a deal is shown as the deal.
  const open = negotiations.filter((r) => !r.needsYou && !r.negotiation.dealId && ['open', 'needs_seller'].includes(r.negotiation.status));
  const byRecent = (a: Deal, b: Deal) => Date.parse(b.timeline.at(-1)?.at ?? '') - Date.parse(a.timeline.at(-1)?.at ?? '');
  const active = deals.filter((d) => ACTIVE.includes(d.state)).sort(byRecent);
  const finished = deals.filter((d) => !ACTIVE.includes(d.state)).sort(byRecent);

  const DealRow = ({ deal }: { deal: Deal }) => {
    const owner = user.id === deal.sellerId;
    const todo = nextStep(deal, user.id);
    const label = deal.type === 'sale' ? 'Purchase' : deal.type === 'borrow' ? 'Free loan' : 'Rental';
    const amount = deal.type === 'borrow' ? (deal.depositCents ? `${usd(deal.depositCents)} deposit` : 'no deposit') : usd(deal.amountCents);
    return (
      <Link href={`/deals/${deal.id}`} className="block">
        <Card interactive className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate font-semibold">{titles.get(deal.listingId)}</p>
            <p className="text-sm text-muted">
              {label} · {owner ? `with ${personName(deal.buyerId)}` : `from ${personName(deal.sellerId)}`} · {amount}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {todo && <Chip tone="accent">{todo}</Chip>}
            <Chip tone={deal.state === 'SETTLED' ? 'success' : 'neutral'}>{STATE_LABEL[deal.state]}</Chip>
          </div>
        </Card>
      </Link>
    );
  };

  const nothing = !deals.length && !negotiations.length;

  return (
    <div className="mx-auto max-w-3xl space-y-8 px-4 py-6">
      <h1 className="text-2xl font-semibold tracking-tight">Deals</h1>

      {nothing && (
        <EmptyState
          title="No deals yet"
          body="When you rent, buy or lend something, the deal and where the money is shows up here."
          action={
            <Link href="/home" className={buttonClass('primary')}>
              Find something
            </Link>
          }
        />
      )}

      {needsYou.length > 0 && (
        <section className="space-y-3">
          <SectionHeader title="Waiting for your OK" />
          {needsYou.map(({ negotiation: n }) => (
            <Link key={n.id} href={`/negotiate/${n.id}`} className="block">
              <Card interactive className="flex items-center justify-between gap-3 border-accent/40 bg-accent-soft">
                <div>
                  <p className="font-semibold">{titles.get(n.listingId)}</p>
                  <p className="text-sm text-muted">{personName(n.buyerId)} made an offer that needs your decision.</p>
                </div>
                <Chip tone="accent">Decide</Chip>
              </Card>
            </Link>
          ))}
        </section>
      )}

      {active.length > 0 && (
        <section className="space-y-3">
          <SectionHeader title="In progress" />
          {active.map((d) => (
            <DealRow key={d.id} deal={d} />
          ))}
        </section>
      )}

      {open.length > 0 && (
        <section className="space-y-3">
          <SectionHeader title="Negotiating" />
          {open.map(({ negotiation: n, role }) => (
            <Link key={n.id} href={`/negotiate/${n.id}`} className="block">
              <Card interactive className="flex items-center justify-between gap-3">
                <div>
                  <p className="font-semibold">{titles.get(n.listingId)}</p>
                  <p className="text-sm text-muted">
                    {role === 'owner' ? `With ${personName(n.buyerId)}` : 'Your offer'} · {n.kind === 'sale' ? 'purchase' : 'rental'}
                  </p>
                </div>
                <Chip tone="neutral">{n.status === 'needs_seller' ? 'Waiting for the owner' : 'Open'}</Chip>
              </Card>
            </Link>
          ))}
        </section>
      )}

      {finished.length > 0 && (
        <section className="space-y-3">
          <SectionHeader title="Finished" />
          {finished.map((d) => (
            <DealRow key={d.id} deal={d} />
          ))}
        </section>
      )}
    </div>
  );
}
