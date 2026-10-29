import { notFound } from 'next/navigation';
import { DealView } from '@/components/deal/DealView';
import { getDealService } from '@/lib/engine/runtime';

export const dynamic = 'force-dynamic';

/**
 * Deal Timeline: PayPal state, step by step.
 * `?as=<userId>` stands in for the signed-in user until login lands (see NOTES/requests.md).
 */
export default async function DealPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ as?: string }>;
}) {
  const [{ id }, { as }] = await Promise.all([params, searchParams]);
  const deal = await (await getDealService()).getDeal(id).catch((err: unknown) => {
    // Duck-typed: Next can load the engine in separate module graphs, so instanceof is unreliable.
    if ((err as { status?: number }).status === 404) notFound();
    throw err;
  });
  return (
    <main className="min-h-screen bg-stone-50">
      <DealView initial={deal} viewerId={as ?? deal.buyerId} />
    </main>
  );
}
