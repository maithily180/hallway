'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Button, Card, Chip, buttonClass } from '@/components/ui';
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

const STATUS_LABEL: Record<Negotiation['status'], string> = {
  open: 'Negotiating',
  agreed: 'Agreed',
  needs_seller: 'Waiting for the owner',
  declined: 'Closed',
  expired: 'Expired',
};

export function Theater({ initial, viewerId }: { initial: TheaterData; viewerId: string }) {
  const [data, setData] = useState(initial);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const scroller = useRef<HTMLDivElement>(null);

  const { negotiation, messages } = data;
  const id = negotiation.id;
  const isBuyer = viewerId === negotiation.buyerId;
  const isOwner = viewerId === data.ownerId;
  const open = negotiation.status === 'open';

  const refresh = useCallback(async () => {
    const res = await fetch(`/api/negotiations/${id}/theater`);
    if (res.ok) setData(await res.json());
  }, [id]);

  // The owner sees the buyer's side of the chat live; the buyer sees "ask me" answers arrive.
  useEffect(() => {
    const t = setInterval(refresh, 3000);
    return () => clearInterval(t);
  }, [refresh]);

  useEffect(() => {
    // Scroll the chat itself (scrollIntoView would also scroll the whole page on phones).
    const el = scroller.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }, [messages.length]);

  async function post(path: string, body: unknown) {
    setBusy(true);
    setError(undefined);
    try {
      const res = await fetch(`/api/negotiations/${id}/${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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

  // A free loan has nothing to haggle over: it starts agreed at $0 and holds only a deposit.
  if (negotiation.agreedCents === 0 && negotiation.status === 'agreed') {
    return (
      <div className="mx-auto max-w-xl px-4 py-10">
        <Card className="space-y-4 text-center">
          <Chip tone="success" className="mx-auto">
            Free loan
          </Chip>
          <h1 className="text-2xl font-semibold tracking-tight">{isBuyer ? 'You can borrow this' : 'A loan was requested'}</h1>
          <p className="text-sm text-muted">
            No haggling needed. If the owner asks for a deposit, it is held on PayPal while {isBuyer ? 'you have' : 'it is out with'} it and
            released when it comes back in good order.
          </p>
          {negotiation.dealId && (
            <Link className={buttonClass('primary', 'lg')} href={`/deals/${negotiation.dealId}`}>
              {isBuyer ? 'Continue to the deposit hold' : 'Open the deal'}
            </Link>
          )}
        </Card>
      </div>
    );
  }

  const points = buildLadder(data.listPriceCents, messages, negotiation);

  return (
    <div className="mx-auto grid max-w-5xl gap-8 px-4 py-6 md:grid-cols-[1.2fr_1fr]">
      <Card className="flex h-[34rem] flex-col p-0">
        <header className="space-y-1 border-b border-border p-4">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-semibold">
              {negotiation.kind === 'rent' ? 'Rental' : 'Purchase'} negotiation · list {usd(data.listPriceCents)}
              {negotiation.kind === 'rent' ? ' / day' : ''}
            </h1>
            <Chip tone={negotiation.status === 'agreed' ? 'success' : 'accent'}>{STATUS_LABEL[negotiation.status]}</Chip>
          </div>
          <p className="text-sm text-muted">
            You are the <strong className="text-foreground">{isBuyer ? 'buyer' : isOwner ? 'owner' : 'guest'}</strong>
            {isOwner && data.mode === 'full_auto' && ' · Hallway negotiates for you'}
          </p>
        </header>

        <div ref={scroller} className="flex-1 space-y-3 overflow-y-auto p-4" aria-live="polite">
          {messages.length === 0 && <p className="text-sm text-muted">Make an offer to get started.</p>}
          {messages.map((m) => (
            <div key={m.id} className={m.from === 'buyer' ? 'flex justify-end' : 'flex justify-start'}>
              <div
                className={[
                  'max-w-[80%] rounded-2xl px-4 py-2 text-sm',
                  m.from === 'buyer'
                    ? 'bg-foreground text-background'
                    : m.from === 'agent'
                      ? 'bg-accent-soft text-foreground'
                      : 'bg-success-soft text-foreground',
                ].join(' ')}
              >
                <p>{m.text}</p>
                {m.blockedReason && (
                  <p className="mt-1 text-xs font-medium text-danger">Blocked: {m.blockedReason.replace(/_/g, ' ')}</p>
                )}
              </div>
            </div>
          ))}
        </div>

        <footer className="space-y-3 border-t border-border p-4">
          {error && (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          )}

          {negotiation.status === 'agreed' && (
            <div className="flex items-center justify-between gap-3 rounded-xl bg-success-soft p-3">
              <p className="text-sm">
                Deal at <strong>{usd(negotiation.agreedCents ?? 0)}</strong>
              </p>
              {negotiation.dealId && (
                <Link className={buttonClass('primary')} href={`/deals/${negotiation.dealId}`}>
                  {isBuyer ? 'Continue to payment' : 'Open the deal'}
                </Link>
              )}
            </div>
          )}

          {negotiation.status === 'needs_seller' && isOwner && (
            <div className="space-y-2 rounded-xl bg-accent-soft p-3">
              <p className="text-sm">The buyer made an offer that needs your OK.</p>
              <div className="flex gap-2">
                <Button disabled={busy} onClick={() => post('decision', { decision: 'accept' })}>
                  Accept
                </Button>
                <Button variant="secondary" disabled={busy} onClick={() => post('decision', { decision: 'decline' })}>
                  Decline
                </Button>
              </div>
            </div>
          )}
          {negotiation.status === 'needs_seller' && !isOwner && (
            <p className="text-sm text-muted">Waiting for the owner to respond.</p>
          )}
          {(negotiation.status === 'declined' || negotiation.status === 'expired') && (
            <p className="text-sm text-muted">This negotiation is closed.</p>
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
                className="h-10 flex-1 rounded-xl border border-border bg-surface px-4 text-sm"
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Make an offer, e.g. “Would you take $26?”"
                maxLength={1000}
                aria-label="Your message"
              />
              <Button disabled={busy || !text.trim()}>Send</Button>
            </form>
          )}
        </footer>
      </Card>

      <section>
        <h2 className="mb-3 text-lg font-semibold">Price ladder</h2>
        <PriceLadder points={points} floorCents={data.floorCents} />
        {isOwner && <p className="mt-3 text-xs text-muted">Only you can see your floor. Hallway&rsquo;s AI never does.</p>}
      </section>
    </div>
  );
}
