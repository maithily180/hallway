import { cookies } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { Theater } from '@/components/deal/Theater';
import { SESSION_COOKIE, verifySession } from '@/lib/auth/session';
import { getNegotiationService } from '@/lib/negotiation/runtime';

export const dynamic = 'force-dynamic';

/** Negotiation Theater: the chat on the left, the live price ladder on the right. */
export default async function NegotiatePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await verifySession((await cookies()).get(SESSION_COOKIE)?.value);
  if (!user) redirect(`/login?next=${encodeURIComponent(`/negotiate/${id}`)}`);

  const data = await (await getNegotiationService()).getTheaterView(id, user.id).catch((err: unknown) => {
    // Unknown or not yours: the same 404, so a negotiation's existence is not leaked.
    const status = (err as { status?: number }).status;
    if (status === 404 || status === 403) notFound();
    throw err;
  });
  return <Theater initial={data} viewerId={user.id} />;
}
