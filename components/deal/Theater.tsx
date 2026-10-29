'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Cents, NegoMessage, Negotiation } from '@/lib/contracts';
import { buildLadder } from '@/lib/negotiation/theater';
import { usd } from './format';
import { PriceLadder } from './PriceLadder';

export interface TheaterData {
  negotiation: Negotiation;
  messages: NegoMessage[];
  listPriceCents: Cents;
  ownerId: string;
  /** Present only when the viewer is the owner. */
  floorCents?: Cents;
  mode: 'full_auto' | 'ask_me';
}

const primary = 'rounded-full bg-stone-900 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50';
const quiet = 'rounded-full border border-stone-300 px-5 py-2.5 text-sm font-medium text-stone-700 disabled:opacity-50';

export function Theater({ initial, viewerId }: { initial: TheaterData; viewerId: string }) {
  const [data, setData] = useState(initial);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const endRef = useRef<HTMLDivElement>(null);

  const { negotiation, messages } = data;
  const id = negotiation.id;
  const isBuyer = viewerId === negotiation.buyerId;
  const isOwner = viewerId === data.ownerId;
  const open = negotiation.status === 'open';

  const refresh = useCallback(async () => {
    const res = await fetch(`/api/negotiations/${id}/theater`, { headers: { 'x-user-id': viewerId } });
    if (res.ok) setData(await res.json());
  }, [id, viewerId]);

  // The seller sees the buyer's side of the chat live; the buyer sees "ask me" answers arrive.
  useEffect(() => {
    const t = setInterval(refresh, 3000);
    return () => clearInterval(t);
  }, [refresh]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  async function post(path: string, body: unknown) {
    setBusy(true);
    setError(undefined);
    try {
      const res = await fetch(`/api/negotiations/${id}/${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-user-id': viewerId },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Something went wrong');
      await refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function send() {
    const body = text.trim();
    if (!body) return;
    setText('');
    await post('messages', { text: body });
  }

  const points = buildLadder(data.listPriceCents, messages, negotiation);

  return (
    <div className="mx-auto grid max-w-5xl gap-8 p-6 md:grid-cols-[1.2fr_1fr]">
      <section className="flex h-[34rem] flex-col rounded-2xl bg-white shadow-sm">
        <header className="border-b border-stone-200 p-4">
          <h1 className="font-semibold text-stone-900">
            {negotiation.kind === 'rent' ? 'Rental' : 'Sale'} negotiation · list {usd(data.listPriceCents)}
          </h1>
          <p className="text-sm text-stone-500">
            You are <strong>{viewerId}</strong> ({isBuyer ? 'buyer' : isOwner ? 'owner' : 'guest'}) ·{' '}
            {negotiation.status.replace('_', ' ')}
          </p>
        </header>

        <div className="flex-1 space-y-3 overflow-y-auto p-4" aria-live="polite">
          {messages.length === 0 && <p className="text-sm text-stone-500">Make an offer to get started.</p>}
          {messages.map((m) => (
            <div key={m.id} className={m.from === 'buyer' ? 'flex justify-end' : 'flex justify-start'}>
              <div
                className={[
                  'max-w-[80%] rounded-2xl px-4 py-2 text-sm',
                  m.from === 'buyer' ? 'bg-stone-900 text-white' : m.from === 'agent' ? 'bg-amber-100 text-stone-900' : 'bg-emerald-100 text-stone-900',
                ].join(' ')}
              >
                <p>{m.text}</p>
                {m.blockedReason && <p className="mt-1 text-xs font-medium text-red-300">Blocked: {m.blockedReason.replace(/_/g, ' ')}</p>}
              </div>
            </div>
          ))}
          <div ref={endRef} />
        </div>

        <footer className="space-y-3 border-t border-stone-200 p-4">
          {error && <p role="alert" className="text-sm text-red-700">{error}</p>}

          {negotiation.status === 'agreed' && (
            <div className="flex items-center justify-between rounded-xl bg-emerald-50 p-3">
              <p className="text-sm text-emerald-900">
                Deal at <strong>{usd(negotiation.agreedCents ?? 0)}</strong>
              </p>
              {negotiation.dealId && (
                <Link className={primary} href={`/deals/${negotiation.dealId}?as=${viewerId}`}>
                  Continue to payment
                </Link>
              )}
            </div>
          )}

          {negotiation.status === 'needs_seller' && isOwner && (
            <div className="space-y-2 rounded-xl bg-amber-50 p-3">
              <p className="text-sm text-amber-900">The buyer made an offer that needs your OK.</p>
              <div className="flex gap-2">
                <button className={primary} disabled={busy} onClick={() => post('decision', { decision: 'accept' })}>Accept</button>
                <button className={quiet} disabled={busy} onClick={() => post('decision', { decision: 'decline' })}>Decline</button>
              </div>
            </div>
          )}
          {negotiation.status === 'needs_seller' && !isOwner && (
            <p className="text-sm text-stone-600">Waiting for the seller to respond.</p>
          )}
          {(negotiation.status === 'declined' || negotiation.status === 'expired') && (
            <p className="text-sm text-stone-600">This negotiation is closed.</p>
          )}

          {open && isBuyer && (
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                void send();
              }}
            >
              <input
                className="flex-1 rounded-full border border-stone-300 px-4 py-2 text-sm"
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Make an offer, e.g. “Would you take $26?”"
                maxLength={1000}
              />
              <button className={primary} disabled={busy || !text.trim()}>Send</button>
            </form>
          )}
        </footer>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold text-stone-900">Price ladder</h2>
        <PriceLadder points={points} floorCents={data.floorCents} />
        {isOwner && (
          <p className="mt-3 text-xs text-stone-500">Only you can see your floor. Hallway&rsquo;s AI never does.</p>
        )}
      </section>
    </div>
  );
}
