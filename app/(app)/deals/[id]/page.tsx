import { cookies } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { DealView } from '@/components/deal/DealView';
import { SESSION_COOKIE, verifySession } from '@/lib/auth/session';
import { getDealService } from '@/lib/engine/runtime';

export const dynamic = 'force-dynamic';

/** Deal Timeline: PayPal state, step by step, for the buyer and the owner of the deal. */
export default async function DealPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await verifySession((await cookies()).get(SESSION_COOKIE)?.value);
  if (!user) redirect(`/login?next=${encodeURIComponent(`/deals/${id}`)}`);

  const deal = await (await getDealService()).getDeal(id, user.id).catch((err: unknown) => {
    // Unknown deal or not yours: the same 404, so a deal's existence is not leaked.
    // Duck-typed: Next can load the engine in separate module graphs, so instanceof is unreliable.
    const status = (err as { status?: number }).status;
    if (status === 404 || status === 403) notFound();
    throw err;
  });
  return <DealView initial={deal} viewerId={user.id} />;
}
