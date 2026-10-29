'use client';

import { useEffect, useRef, useState } from 'react';

declare global {
  interface Window {
    paypal?: {
      Buttons: (config: {
        createOrder: () => Promise<string>;
        onApprove: (data: { orderID: string }) => Promise<void>;
        onError: (err: unknown) => void;
        style?: Record<string, string>;
      }) => { render: (el: HTMLElement) => Promise<void>; close?: () => void };
    };
  }
}

interface Props {
  dealId: string;
  /** Sales capture immediately; rentals authorize rent + deposit. */
  type: 'sale' | 'rent' | 'borrow';
  viewerId: string;
  onDone: () => void;
}

const MOCK = process.env.NEXT_PUBLIC_MOCK_PAYPAL === '1';
const CLIENT_ID = process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID;
const headers = (viewerId: string) => ({ 'Content-Type': 'application/json', 'x-user-id': viewerId });

async function call<T>(url: string, viewerId: string, body?: unknown): Promise<T> {
  const res = await fetch(url, { method: 'POST', headers: headers(viewerId), body: body ? JSON.stringify(body) : undefined });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? 'request failed');
  return json as T;
}

function loadSdk(clientId: string, intent: 'capture' | 'authorize'): Promise<void> {
  const src = `https://www.paypal.com/sdk/js?client-id=${encodeURIComponent(clientId)}&currency=USD&intent=${intent}&enable-funding=venmo`;
  const existing = document.querySelector<HTMLScriptElement>(`script[src="${src}"]`);
  if (existing && window.paypal) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const script = existing ?? document.createElement('script');
    script.src = src;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Could not load PayPal'));
    if (!existing) document.head.appendChild(script);
  });
}

export function PayPalButton({ dealId, type, viewerId, onDone }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (MOCK || !CLIENT_ID) return;
    const clientId = CLIENT_ID;
    let buttons: ReturnType<NonNullable<Window['paypal']>['Buttons']> | undefined;
    loadSdk(clientId, type === 'sale' ? 'capture' : 'authorize')
      .then(() => {
        if (!container.current || !window.paypal) return;
        buttons = window.paypal.Buttons({
          style: { layout: 'vertical', shape: 'rect' },
          createOrder: async () => (await call<{ paypalOrderId: string }>(`/api/deals/${dealId}/pay`, viewerId)).paypalOrderId,
          onApprove: async ({ orderID }) => {
            await call(`/api/deals/${dealId}/approve`, viewerId, { paypalOrderId: orderID });
            onDone();
          },
          onError: (err) => setError(err instanceof Error ? err.message : 'Payment failed'),
        });
        return buttons.render(container.current);
      })
      .catch((err: Error) => setError(err.message));
    return () => buttons?.close?.();
  }, [dealId, type, viewerId, onDone]);

  if (MOCK) {
    // No PayPal keys: same two server calls the real button makes.
    return (
      <div>
        <button
          disabled={busy}
          className="w-full rounded-full bg-amber-500 px-6 py-3 font-semibold text-stone-900 disabled:opacity-50"
          onClick={async () => {
            setBusy(true);
            try {
              const { paypalOrderId } = await call<{ paypalOrderId: string }>(`/api/deals/${dealId}/pay`, viewerId);
              await call(`/api/deals/${dealId}/approve`, viewerId, { paypalOrderId });
              onDone();
            } catch (err) {
              setError((err as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? 'Processing…' : 'Pay with PayPal (mock)'}
        </button>
        {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
      </div>
    );
  }

  if (!CLIENT_ID) {
    return <p className="text-sm text-red-700">PayPal is not configured (NEXT_PUBLIC_PAYPAL_CLIENT_ID).</p>;
  }

  return (
    <div>
      <div ref={container} />
      {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
    </div>
  );
}
