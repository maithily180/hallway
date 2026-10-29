import { notFound } from 'next/navigation';
import { Theater } from '@/components/deal/Theater';
import { getNegotiationService } from '@/lib/negotiation/runtime';

export const dynamic = 'force-dynamic';

/**
 * Negotiation Theater: the chat on the left, the live price ladder on the right.
 * `?as=<userId>` stands in for the signed-in user until login lands (see NOTES/requests.md).
 */
export default async function NegotiatePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ as?: string }>;
}) {
  const [{ id }, { as }] = await Promise.all([params, searchParams]);
  const service = await getNegotiationService();
  const first = await service.getNegotiation(id).catch((err: unknown) => {
    // Duck-typed: Next can load modules in separate graphs, so instanceof is unreliable.
    if ((err as { status?: number }).status === 404) notFound();
    throw err;
  });
  const viewerId = as ?? first.negotiation.buyerId;
  const data = await service.getTheaterView(id, viewerId);

  return (
    <main className="min-h-screen bg-stone-50">
      <Theater initial={data} viewerId={viewerId} />
    </main>
  );
}
