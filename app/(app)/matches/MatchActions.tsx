"use client";

import { useState } from "react";
import type { ListingMode } from "@/lib/contracts";
import { Button } from "@/components/ui";

const LABEL: Record<ListingMode, string> = { rent: "Rent it", sell: "Make offer", lend: "Ask to borrow" };

/** Starts a negotiation with Maithily's API and opens the Negotiation Theater. */
export function MatchActions({ listingId, mode, available }: { listingId: string; mode: ListingMode; available: boolean }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/negotiations", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ listingId, kind: mode === "sell" ? "sale" : "rent", rentDays: mode === "sell" ? undefined : 1 }),
    });
    if (res.ok) {
      const { id } = (await res.json()) as { id: string };
      window.location.assign(`/negotiate/${id}`);
      return;
    }
    setBusy(false);
    setError(res.status === 404 ? "Negotiation opens once the deals service is live." : "Could not start. Try again.");
  }

  return (
    <div className="flex flex-col gap-1">
      <Button onClick={start} disabled={busy || !available}>
        {available ? (busy ? "Starting…" : LABEL[mode]) : "Not available"}
      </Button>
      {error && <p className="text-sm text-danger">{error}</p>}
    </div>
  );
}
