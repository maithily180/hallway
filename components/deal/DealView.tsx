'use client';

import { QRCodeSVG } from 'qrcode.react';
import { useCallback, useEffect, useState } from 'react';
import type { Deal, InspectionResult } from '@/lib/contracts';
import { usd } from './format';
import { DealTimeline } from './DealTimeline';
import { PayPalButton } from './PayPalButton';

const field = 'w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm';
const primary = 'rounded-full bg-stone-900 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50';
const quiet = 'rounded-full border border-stone-300 px-5 py-2.5 text-sm font-medium text-stone-700 disabled:opacity-50';

export function DealView({ initial, viewerId }: { initial: Deal; viewerId: string }) {
  const [deal, setDeal] = useState(initial);
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [qrToken, setQrToken] = useState<string>();
  const [inspection, setInspection] = useState<InspectionResult>();
  const [photo, setPhoto] = useState('');
  const [scanned, setScanned] = useState('');
  const [deduction, setDeduction] = useState('0');
  const [ownerOk, setOwnerOk] = useState(true);
  const [renterOk, setRenterOk] = useState(true);

  const isBuyer = viewerId === deal.buyerId;
  const isSeller = viewerId === deal.sellerId;

  const refresh = useCallback(async () => {
    const res = await fetch(`/api/deals/${deal.id}`, { headers: { 'x-user-id': viewerId } });
    if (res.ok) setDeal(await res.json());
  }, [deal.id, viewerId]);

  // Webhooks move deals on the server; poll so the timeline follows along.
  useEffect(() => {
    const t = setInterval(refresh, 4000);
    return () => clearInterval(t);
  }, [refresh]);

  useEffect(() => {
    if (isBuyer && deal.state === 'HELD') {
      fetch(`/api/deals/${deal.id}/handover`, { headers: { 'x-user-id': viewerId } })
        .then((r) => r.json())
        .then((j) => setQrToken(j.qrToken));
    }
  }, [isBuyer, deal.state, deal.id, viewerId]);

  async function act(path: string, body?: unknown) {
    setBusy(true);
    setError(undefined);
    try {
      const res = await fetch(`/api/deals/${deal.id}/${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-user-id': viewerId },
        body: body ? JSON.stringify(body) : undefined,
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Something went wrong');
      if (json.inspection) setInspection(json.inspection);
      setDeal(json.deal ?? json);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const total = deal.amountCents + deal.depositCents;

  return (
    <div className="mx-auto grid max-w-4xl gap-8 p-6 md:grid-cols-[1fr_1.2fr]">
      <section className="space-y-4">
        <p className="text-sm uppercase tracking-wide text-stone-500">{deal.type === 'sale' ? 'Purchase' : 'Rental'}</p>
        <h1 className="text-4xl font-semibold text-stone-900">{usd(deal.amountCents)}</h1>
        {deal.depositCents > 0 && (
          <p className="text-stone-700">
            + {usd(deal.depositCents)} deposit, held together as <strong>{usd(total)}</strong> on one PayPal authorization.
          </p>
        )}
        <p className="text-sm text-stone-500">
          You are viewing as <strong>{viewerId}</strong> ({isBuyer ? 'buyer' : isSeller ? 'owner' : 'guest'}).
        </p>

        {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}

        {isBuyer && (deal.state === 'AGREED' || deal.state === 'AWAITING_PAYMENT') && (
          <div className="space-y-3">
            <PayPalButton dealId={deal.id} type={deal.type} viewerId={viewerId} onDone={refresh} />
            <button className={quiet} disabled={busy} onClick={() => act('cancel')}>Cancel</button>
          </div>
        )}

        {isBuyer && deal.state === 'HELD' && (
          <div className="space-y-3">
            <p className="text-sm text-stone-700">Show this code to the owner at pickup.</p>
            {qrToken && (
              <div className="inline-block rounded-xl bg-white p-3 shadow-sm">
                <QRCodeSVG value={qrToken} size={160} />
              </div>
            )}
            {qrToken && <p className="break-all font-mono text-xs text-stone-500">{qrToken}</p>}
            <div><button className={quiet} disabled={busy} onClick={() => act('cancel')}>Cancel and release the hold</button></div>
          </div>
        )}

        {isSeller && deal.state === 'HELD' && (
          <div className="space-y-3">
            <label className="block text-sm font-medium">Code from the renter&rsquo;s phone</label>
            <input className={field} value={scanned} onChange={(e) => setScanned(e.target.value)} placeholder="Scan or paste" />
            <label className="block text-sm font-medium">&ldquo;Before&rdquo; photo URL</label>
            <input className={field} value={photo} onChange={(e) => setPhoto(e.target.value)} placeholder="https://…" />
            <button className={primary} disabled={busy || !scanned || !photo} onClick={() => act('handover', { qrToken: scanned, beforePhotos: [photo] })}>
              Confirm handover
            </button>
          </div>
        )}

        {isBuyer && deal.state === 'OUT' && (
          <div className="space-y-3">
            <label className="block text-sm font-medium">&ldquo;After&rdquo; photo URL</label>
            <input className={field} value={photo} onChange={(e) => setPhoto(e.target.value)} placeholder="https://…" />
            <button className={primary} disabled={busy || !photo} onClick={() => act('return', { afterPhotos: [photo] })}>
              Return item
            </button>
          </div>
        )}

        {inspection && (
          <div className="rounded-xl bg-stone-100 p-4 text-sm">
            <p className="font-medium">Inspector: {inspection.summary}</p>
            <p className="text-stone-600">
              Confidence {Math.round(inspection.confidence * 100)}%. Proposed deduction {usd(inspection.proposedDeductionCents)}.
            </p>
          </div>
        )}

        {isSeller && (deal.state === 'RETURNED' || deal.state === 'CLAIMED') && (
          <div className="space-y-3">
            <label className="block text-sm font-medium">Deduction in dollars (0 for a clean return)</label>
            <input className={field} inputMode="decimal" value={deduction} onChange={(e) => setDeduction(e.target.value)} />
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={ownerOk} onChange={(e) => setOwnerOk(e.target.checked)} /> I confirm this deduction</label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={renterOk} onChange={(e) => setRenterOk(e.target.checked)} /> Renter agrees</label>
            <button
              className={primary}
              disabled={busy}
              onClick={() => act('settle', { deductionCents: Math.round(Number(deduction) * 100), ownerOk, renterOk })}
            >
              Settle
            </button>
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-4 text-lg font-semibold text-stone-900">Where the money is</h2>
        <DealTimeline deal={deal} />
      </section>
    </div>
  );
}
