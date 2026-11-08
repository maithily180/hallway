'use client';

import { QRCodeSVG } from 'qrcode.react';
import { useCallback, useEffect, useState } from 'react';
import { Button, Card, Chip, InspectionCard } from '@/components/ui';
import type { Deal, InspectionResult } from '@/lib/contracts';
import { DealTimeline } from './DealTimeline';
import { usd } from './format';
import { PayPalButton } from './PayPalButton';
import { PhotoPicker } from './PhotoPicker';

interface InspectionData {
  beforePhotos: string[];
  afterPhotos: string[];
  result?: InspectionResult;
  deductionCents?: number;
  ownerDecision?: 'ok' | 'dispute';
  renterDecision?: 'ok' | 'dispute';
  depositCents: number;
}

const field = 'w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm';

const HEADLINE: Record<Deal['state'], string> = {
  AGREED: 'Deal agreed',
  AWAITING_PAYMENT: 'Waiting for payment',
  PAID: 'Paid',
  HELD: 'Funds held, ready for pickup',
  OUT: 'Out on loan',
  RETURNED: 'Returned, awaiting settlement',
  SETTLED: 'All settled',
  VOIDED: 'Cancelled',
  CLAIMED: 'Deduction under review',
  REFUNDED: 'Refunded',
};

/** The deal at /deals/[id]: the money timeline on one side, what you can do next on the other. */
export function DealView({ initial, viewerId }: { initial: Deal; viewerId: string }) {
  const [deal, setDeal] = useState(initial);
  const [inspection, setInspection] = useState<InspectionData | null>(null);
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [qrToken, setQrToken] = useState<string>();
  const [scanned, setScanned] = useState('');
  const [before, setBefore] = useState<string[]>([]);
  const [after, setAfter] = useState<string[]>([]);
  const [deduction, setDeduction] = useState<string>();

  const isBuyer = viewerId === deal.buyerId;
  const isSeller = viewerId === deal.sellerId;
  const total = deal.amountCents + deal.depositCents;

  const refresh = useCallback(async () => {
    const res = await fetch(`/api/deals/${deal.id}`);
    if (res.ok) setDeal(await res.json());
  }, [deal.id]);

  const loadInspection = useCallback(async () => {
    const res = await fetch(`/api/deals/${deal.id}/inspection`);
    if (res.ok) setInspection(await res.json());
  }, [deal.id]);

  // Webhooks move deals on the server; poll so the timeline follows along.
  useEffect(() => {
    const t = setInterval(refresh, 4000);
    return () => clearInterval(t);
  }, [refresh]);

  useEffect(() => {
    if (['RETURNED', 'CLAIMED', 'SETTLED'].includes(deal.state)) void loadInspection();
  }, [deal.state, loadInspection]);

  useEffect(() => {
    if (isBuyer && deal.state === 'HELD') {
      fetch(`/api/deals/${deal.id}/handover`)
        .then((r) => r.json())
        .then((j) => setQrToken(j.qrToken));
    }
  }, [isBuyer, deal.state, deal.id]);

  async function act(path: string, body?: unknown) {
    setBusy(true);
    setError(undefined);
    try {
      const res = await fetch(`/api/deals/${deal.id}/${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Something went wrong');
      setDeal(json.deal ?? json);
      if (path === 'return' || path === 'settle') await loadInspection();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const proposed = inspection?.result?.proposedDeductionCents ?? 0;
  const deductionValue = deduction ?? (proposed / 100).toString();
  const ownerResponded = inspection?.ownerDecision === 'ok' && (inspection.deductionCents ?? 0) > 0;

  return (
    <div className="mx-auto grid max-w-5xl gap-8 px-4 py-6 md:grid-cols-[1fr_1.1fr]">
      <section className="space-y-5">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <Chip tone="outline">{deal.type === 'sale' ? 'Purchase' : 'Rental'}</Chip>
            <Chip tone={deal.state === 'SETTLED' ? 'success' : ['VOIDED', 'REFUNDED'].includes(deal.state) ? 'neutral' : 'accent'}>
              {HEADLINE[deal.state]}
            </Chip>
          </div>
          <h1 className="text-4xl font-semibold tracking-tight">{usd(deal.amountCents)}</h1>
          {deal.depositCents > 0 && (
            <p className="text-muted">
              + {usd(deal.depositCents)} deposit, held together as <strong className="text-foreground">{usd(total)}</strong> on one
              PayPal authorization.
            </p>
          )}
          <p className="text-sm text-muted">
            You are the <strong className="text-foreground">{isBuyer ? (deal.type === 'sale' ? 'buyer' : 'renter') : isSeller ? 'owner' : 'guest'}</strong>.
          </p>
        </div>

        {error && (
          <p role="alert" className="rounded-xl bg-danger-soft p-3 text-sm text-danger">
            {error}
          </p>
        )}

        {isBuyer && (deal.state === 'AGREED' || deal.state === 'AWAITING_PAYMENT') && (
          <Card className="space-y-3">
            <PayPalButton dealId={deal.id} type={deal.type} onDone={refresh} />
            <Button variant="ghost" disabled={busy} onClick={() => act('cancel')}>
              Cancel
            </Button>
          </Card>
        )}

        {isSeller && (deal.state === 'AGREED' || deal.state === 'AWAITING_PAYMENT') && (
          <Card className="text-sm text-muted">Waiting for the buyer to pay with PayPal. Nothing is needed from you yet.</Card>
        )}

        {isBuyer && deal.state === 'HELD' && (
          <Card className="space-y-3">
            <p className="text-sm">Show this code to the owner at pickup.</p>
            {qrToken && (
              <div className="inline-block rounded-xl bg-white p-3 shadow-sm">
                <QRCodeSVG value={qrToken} size={168} />
              </div>
            )}
            {qrToken && <p className="break-all font-mono text-xs text-muted">{qrToken}</p>}
            <Button variant="secondary" disabled={busy} onClick={() => act('cancel')}>
              Cancel and release the hold
            </Button>
          </Card>
        )}

        {isSeller && deal.state === 'HELD' && (
          <Card className="space-y-3">
            <p className="text-sm font-medium">Hand it over</p>
            <label className="block text-sm">
              Code from the renter&rsquo;s phone
              <input className={`${field} mt-1`} value={scanned} onChange={(e) => setScanned(e.target.value)} placeholder="Scan or paste" />
            </label>
            <PhotoPicker label="Photos of the item before it leaves" photos={before} onChange={setBefore} />
            <Button disabled={busy || !scanned || !before.length} onClick={() => act('handover', { qrToken: scanned, beforePhotos: before })}>
              Confirm handover
            </Button>
          </Card>
        )}

        {isBuyer && deal.state === 'OUT' && (
          <Card className="space-y-3">
            <p className="text-sm font-medium">Return it</p>
            <PhotoPicker label="Photos of the item as you return it" photos={after} onChange={setAfter} />
            <Button disabled={busy || !after.length} onClick={() => act('return', { afterPhotos: after })}>
              Return item
            </Button>
          </Card>
        )}
        {isSeller && deal.state === 'OUT' && (
          <Card className="text-sm text-muted">Out with the renter. You&rsquo;ll review the return when they bring it back.</Card>
        )}

        {inspection?.result && (
          <InspectionCard
            result={inspection.result}
            before={inspection.beforePhotos}
            after={inspection.afterPhotos}
            depositCents={inspection.depositCents}
          />
        )}

        {isSeller && (deal.state === 'RETURNED' || deal.state === 'CLAIMED') && (
          <Card className="space-y-3">
            <p className="text-sm font-medium">Settle the rental</p>
            <p className="text-sm text-muted">
              Hallway captures the rent ({usd(deal.amountCents)}) and PayPal releases the rest of the hold. If you deduct for
              damage, the renter has to agree to the exact amount first.
            </p>
            <label className="block text-sm">
              Deduction in dollars (0 for a clean return, max {usd(deal.depositCents)})
              <input
                className={`${field} mt-1`}
                inputMode="decimal"
                value={deductionValue}
                onChange={(e) => setDeduction(e.target.value)}
              />
            </label>
            {inspection?.renterDecision === 'dispute' && deal.state === 'CLAIMED' && (
              <p className="text-sm text-danger">The renter disputed the last amount. Adjust it or settle with 0.</p>
            )}
            {ownerResponded && inspection?.renterDecision === undefined && (
              <p className="text-sm text-muted">Waiting for the renter to respond to {usd(inspection?.deductionCents ?? 0)}.</p>
            )}
            <Button
              disabled={busy}
              onClick={() => act('settle', { deductionCents: Math.round(Number(deductionValue) * 100), ownerOk: true })}
            >
              {Number(deductionValue) > 0 ? 'Propose this deduction' : 'Settle with no deduction'}
            </Button>
          </Card>
        )}

        {isBuyer && (deal.state === 'RETURNED' || deal.state === 'CLAIMED') && (
          <Card className="space-y-3">
            {ownerResponded ? (
              <>
                <p className="text-sm font-medium">
                  The owner proposes a deduction of {usd(inspection?.deductionCents ?? 0)}
                </p>
                <p className="text-sm text-muted">
                  If you accept, Hallway captures {usd(deal.amountCents + (inspection?.deductionCents ?? 0))} and releases the rest.
                  If you dispute, nothing is captured until you agree or it&rsquo;s reviewed.
                </p>
                <div className="flex gap-2">
                  <Button disabled={busy} onClick={() => act('settle', { renterOk: true })}>
                    Accept {usd(inspection?.deductionCents ?? 0)}
                  </Button>
                  <Button variant="secondary" disabled={busy} onClick={() => act('settle', { renterOk: false })}>
                    Dispute
                  </Button>
                </div>
              </>
            ) : (
              <p className="text-sm text-muted">The owner is reviewing the return. Nothing is captured until they respond.</p>
            )}
          </Card>
        )}
      </section>

      <section>
        <h2 className="mb-4 text-lg font-semibold">Where the money is</h2>
        <DealTimeline deal={deal} />
      </section>
    </div>
  );
}
