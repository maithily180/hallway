"use client";

import Link from "next/link";
import { useState } from "react";
import type { ListingDraft, PriceSuggestion } from "@/lib/contracts";
import { Button, Card, Chip, EmptyState, formatCents } from "@/components/ui";
import { autoAcceptFor } from "../form";
import { dedupeDrafts, MAX_FRAMES, moveOutFloor, videoFrames, type BulkItem } from "../moveout";
import { toDataUrl } from "../photos";

type Row = BulkItem & { price: PriceSuggestion; selected: boolean; title: string };
type Step = "pick" | "review" | "done";

async function postJson<T>(url: string, body: unknown, method = "POST"): Promise<T> {
  const res = await fetch(url, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`${url} failed (${res.status})`);
  return res.json() as Promise<T>;
}

/** Runs fn over items, a few at a time, so a dozen vision calls don't all fire at once. */
async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]);
      }
    }),
  );
  return out;
}

export function MoveOutFlow() {
  const [step, setStep] = useState<Step>("pick");
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [listed, setListed] = useState(0);
  const [floorsSaved, setFloorsSaved] = useState(true);

  async function analyse(files: FileList | null) {
    if (!files?.length) return;
    setError(null);
    try {
      setProgress("Reading your photos…");
      const photos: string[] = [];
      for (const f of Array.from(files)) {
        if (f.type.startsWith("video/")) photos.push(...(await videoFrames(f)));
        else if (f.type.startsWith("image/")) photos.push(await toDataUrl(f));
      }
      const frames = photos.slice(0, MAX_FRAMES * 2);
      let done = 0;
      setProgress(`Drafting 0 of ${frames.length}…`);
      const drafted = await mapLimit(frames, 3, async (photo) => {
        const draft = await postJson<ListingDraft>("/api/listings/draft", { photos: [photo], note: "" }).catch(() => null);
        setProgress(`Drafting ${++done} of ${frames.length}…`);
        return draft && { key: crypto.randomUUID(), photo, draft };
      });
      const items = dedupeDrafts(drafted.filter((d): d is BulkItem => d !== null));
      setProgress(`Pricing ${items.length} items…`);
      const priced = await mapLimit(items, 3, async (item) => ({
        ...item,
        title: item.draft.title,
        selected: true,
        price: await postJson<PriceSuggestion>("/api/price", { draft: item.draft, urgency: "high" }),
      }));
      setRows(priced);
      setStep("review");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong. Please try again.");
    } finally {
      setProgress(null);
    }
  }

  async function listSelected() {
    const chosen = rows.filter((r) => r.selected && r.title.trim());
    setError(null);
    setProgress(`Listing ${chosen.length} ${chosen.length === 1 ? "item" : "items"}…`);
    try {
      const saved = await mapLimit(chosen, 3, async (r) => {
        const listCents = r.price.fastSaleCents;
        const floorCents = moveOutFloor(listCents);
        const listing = await postJson<{ id: string }>("/api/listings", {
          ...r.draft,
          title: r.title.trim(),
          photos: [r.photo],
          modes: ["sell"],
          salePriceCents: listCents,
          status: "active",
        });
        return postJson(
          `/api/policies/${listing.id}`,
          {
            listPriceCents: listCents,
            floorCents,
            autoAcceptCents: autoAcceptFor(listCents, floorCents),
            mode: "full_auto",
            strategy: "sell_fast",
            maxRounds: 4,
            tone: "friendly",
            extrasAllowed: [],
          },
          "PUT",
        ).then(
          () => true,
          () => false,
        );
      });
      setFloorsSaved(saved.every(Boolean));
      setListed(chosen.length);
      setStep("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong. Please try again.");
    } finally {
      setProgress(null);
    }
  }

  const update = (key: string, patch: Partial<Row>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const chosen = rows.filter((r) => r.selected);
  const total = chosen.reduce((s, r) => s + r.price.fastSaleCents, 0);

  if (step === "done")
    return (
      <EmptyState
        title={`${listed} ${listed === 1 ? "item" : "items"} listed`}
        body={
          floorsSaved
            ? "Each one is priced to sell fast. Your agent accepts offers down to 80% of the price."
            : "Each one is priced to sell fast. Floors at 80% of the price lock in as soon as the negotiation service is live."
        }
        action={
          <Link href="/stuff" className="text-sm font-medium text-accent">
            See them in My Stuff
          </Link>
        }
      />
    );

  return (
    <div className="flex flex-col gap-4">
      {step === "pick" && (
        <Card className="flex flex-col gap-3">
          <label className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border border-dashed border-border px-4 py-10 text-center hover:border-accent">
            <span className="font-medium">Add a video or photos</span>
            <span className="text-sm text-muted">A slow 20-second pan around your room works best.</span>
            <input
              type="file"
              accept="video/*,image/*"
              multiple
              className="sr-only"
              disabled={!!progress}
              onChange={(e) => analyse(e.target.files)}
            />
          </label>
        </Card>
      )}

      {progress && (
        <p className="text-sm text-muted" aria-live="polite">
          {progress}
        </p>
      )}
      {error && <p className="text-sm text-danger">{error}</p>}

      {step === "review" &&
        (rows.length === 0 ? (
          <EmptyState title="No items found" body="Try a slower video with each item in view for a second or two." />
        ) : (
          <>
            {rows.map((r) => (
              <Card key={r.key} className={r.selected ? "flex gap-3" : "flex gap-3 opacity-60"}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={r.photo} alt="" className="size-20 shrink-0 rounded-xl object-cover" />
                <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                  <input
                    value={r.title}
                    onChange={(e) => update(r.key, { title: e.target.value })}
                    className="w-full rounded-lg border border-transparent bg-transparent px-1 font-medium outline-none focus:border-border"
                    aria-label="Title"
                  />
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <Chip>{r.draft.conditionGrade.replace("_", " ")}</Chip>
                    <span className="font-semibold tabular-nums">{formatCents(r.price.fastSaleCents)}</span>
                    <span className="text-muted">floor {formatCents(moveOutFloor(r.price.fastSaleCents))}</span>
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={r.selected}
                  onChange={(e) => update(r.key, { selected: e.target.checked })}
                  className="size-5 accent-[var(--accent)]"
                  aria-label={`List ${r.title}`}
                />
              </Card>
            ))}
            <Button onClick={listSelected} disabled={!!progress || chosen.length === 0}>
              List {chosen.length} {chosen.length === 1 ? "item" : "items"} · {formatCents(total)}
            </Button>
          </>
        ))}
    </div>
  );
}
