"use client";

import { useState } from "react";
import type { ConditionGrade, ListingDraft, ListingMode, PriceSuggestion } from "@/lib/contracts";
import { Button, Card, Chip, formatCents, PriceTag } from "@/components/ui";
import { cx } from "@/components/ui/format";
import { applyAnswers, autoAcceptFor, dollarsToCents, floorError, listPriceFor, type Strategy } from "./form";
import { toDataUrl } from "./photos";

type Step = "photos" | "draft" | "price" | "floor" | "done";

const CONDITIONS: ConditionGrade[] = ["new", "like_new", "good", "fair", "poor"];
const MAX_PHOTOS = 5;
const STEPS: { id: Step; label: string }[] = [
  { id: "photos", label: "Photos" },
  { id: "draft", label: "Details" },
  { id: "price", label: "Price" },
  { id: "floor", label: "Floor" },
];

async function postJson<T>(url: string, body: unknown, method = "POST"): Promise<T> {
  const res = await fetch(url, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  if (res.status === 404) throw new Error("Publishing isn't available yet. Your draft and price are still here.");
  if (!res.ok) throw new Error("Something went wrong. Please try again.");
  return res.json() as Promise<T>;
}

const field = "w-full rounded-xl border border-border bg-surface px-3 py-2.5 outline-none transition focus:border-accent focus:ring-4 focus:ring-accent/15";

export function SellFlow() {
  const [step, setStep] = useState<Step>("photos");
  const [photos, setPhotos] = useState<string[]>([]);
  const [note, setNote] = useState("");
  const [draft, setDraft] = useState<ListingDraft | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [modes, setModes] = useState<ListingMode[]>(["sell"]);
  const [urgency, setUrgency] = useState<"low" | "high">("low");
  const [price, setPrice] = useState<PriceSuggestion | null>(null);
  const [strategy, setStrategy] = useState<Strategy>("best_price");
  const [floor, setFloor] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [listingId, setListingId] = useState<string | null>(null);
  const [floorSaved, setFloorSaved] = useState(true);

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  async function addPhotos(files: FileList | null) {
    if (!files) return;
    const urls = await Promise.all([...files].slice(0, MAX_PHOTOS - photos.length).map(toDataUrl));
    setPhotos((p) => [...p, ...urls]);
  }

  const makeDraft = () =>
    run(async () => {
      setDraft(await postJson<ListingDraft>("/api/listings/draft", { photos, note }));
      setAnswers({});
      setStep("draft");
    });

  const getPrice = () =>
    run(async () => {
      const filled = applyAnswers(draft!, answers);
      setDraft(filled);
      setPrice(await postJson<PriceSuggestion>("/api/price", { draft: filled, urgency }));
      setStrategy(urgency === "high" ? "sell_fast" : "best_price");
      setStep("price");
    });

  const listCents = price ? listPriceFor(price, strategy) : 0;
  const floorCents = dollarsToCents(floor);
  const floorProblem = floor ? floorError(listCents, floorCents) : null;

  const publish = () =>
    run(async () => {
      const problem = floorError(listCents, floorCents);
      if (problem) throw new Error(problem);
      const listing = await postJson<{ id: string }>("/api/listings", {
        ...draft!,
        photos,
        modes,
        salePriceCents: modes.includes("sell") ? listCents : undefined,
        rentPerDayCents: modes.includes("rent") ? price!.rentPerDayCents : undefined,
        depositCents: modes.includes("rent") ? price!.depositCents : undefined,
        status: "active",
      });
      setListingId(listing.id);
      try {
        await postJson(
          `/api/policies/${listing.id}`,
          {
            listPriceCents: listCents,
            floorCents,
            autoAcceptCents: autoAcceptFor(listCents, floorCents),
            mode: "full_auto",
            strategy,
            maxRounds: 4,
            tone: "friendly",
            extrasAllowed: [],
          },
          "PUT",
        );
        setFloorSaved(true);
      } catch {
        setFloorSaved(false);
      }
      setStep("done");
    });

  const stepIndex = STEPS.findIndex((s) => s.id === step);

  return (
    <div className="flex flex-col gap-4">
      {step !== "done" && (
        <ol className="grid grid-cols-4 gap-2" aria-label="Progress">
          {STEPS.map((s, i) => (
            <li key={s.id} className="flex flex-col gap-1.5" aria-current={i === stepIndex ? "step" : undefined}>
              <span className={cx("h-1 rounded-full", i <= stepIndex ? "bg-accent" : "bg-border")} />
              <span className={cx("text-xs", i === stepIndex ? "font-medium text-foreground" : "text-muted")}>{s.label}</span>
            </li>
          ))}
        </ol>
      )}
      {step === "photos" && (
        <Card className="flex flex-col gap-4">
          <p className="text-sm text-muted">Add up to {MAX_PHOTOS} photos and a sentence. Hallway drafts the listing.</p>
          <div className="grid grid-cols-3 gap-2">
            {photos.map((src, i) => (
              <button
                key={i}
                type="button"
                aria-label={`Remove photo ${i + 1}`}
                onClick={() => setPhotos((p) => p.filter((_, j) => j !== i))}
                className="aspect-square overflow-hidden rounded-xl border border-border"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={src} alt="" className="h-full w-full object-cover" />
              </button>
            ))}
            {photos.length < MAX_PHOTOS && (
              <label className="flex aspect-square cursor-pointer items-center justify-center rounded-xl border border-dashed border-border text-sm text-muted hover:border-accent">
                + Photo
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  capture="environment"
                  className="sr-only"
                  onChange={(e) => addPhotos(e.target.files)}
                />
              </label>
            )}
          </div>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Projector, used for movie nights, comes with an HDMI cable"
            rows={2}
            className={field}
          />
          <Button onClick={makeDraft} disabled={busy || (photos.length === 0 && !note.trim())}>
            {busy ? "Reading your photos…" : "Draft my listing"}
          </Button>
        </Card>
      )}

      {step === "draft" && draft && (
        <Card className="flex flex-col gap-4">
          <label className="flex flex-col gap-1 text-sm">
            Title
            <input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} className={field} />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Description
            <textarea
              value={draft.description}
              rows={3}
              onChange={(e) => setDraft({ ...draft, description: e.target.value })}
              className={field}
            />
          </label>
          <div className="flex flex-wrap gap-2">
            {CONDITIONS.map((c) => (
              <button key={c} type="button" onClick={() => setDraft({ ...draft, conditionGrade: c })}>
                <Chip tone={draft.conditionGrade === c ? "accent" : "neutral"}>{c.replace("_", " ")}</Chip>
              </button>
            ))}
          </div>
          {draft.defects.length > 0 && (
            <div className="flex flex-col gap-1 text-sm">
              <span className="font-medium">Defects we spotted</span>
              <ul className="list-disc pl-5 text-muted">
                {draft.defects.map((d) => (
                  <li key={d}>{d}</li>
                ))}
              </ul>
            </div>
          )}
          {draft.missingInfo.map((q) => (
            <label key={q} className="flex flex-col gap-1 text-sm">
              {q}
              <input
                value={answers[q] ?? ""}
                onChange={(e) => setAnswers({ ...answers, [q]: e.target.value })}
                className={field}
              />
            </label>
          ))}
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="font-medium">Offer it to</span>
            {(["sell", "rent", "lend"] as ListingMode[]).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setModes(modes.includes(m) ? modes.filter((x) => x !== m) : [...modes, m])}
              >
                <Chip tone={modes.includes(m) ? "accent" : "neutral"}>{m}</Chip>
              </button>
            ))}
          </div>
          <div className="flex gap-2 text-sm">
            {(["low", "high"] as const).map((u) => (
              <button
                key={u}
                type="button"
                onClick={() => setUrgency(u)}
                className={cx("flex-1 rounded-xl border px-3 py-2", urgency === u ? "border-accent" : "border-border")}
              >
                {u === "high" ? "I need it gone soon" : "No rush"}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setStep("photos")}>
              Back
            </Button>
            <Button className="flex-1" onClick={getPrice} disabled={busy || modes.length === 0 || !draft.title.trim()}>
              {busy ? "Pricing…" : "Suggest a price"}
            </Button>
          </div>
        </Card>
      )}

      {step === "price" && price && (
        <Card className="flex flex-col gap-4">
          <p className="text-sm text-muted">{price.explanation}</p>
          {modes.includes("sell") && (
            <div className="grid grid-cols-2 gap-2">
              {(["sell_fast", "best_price"] as Strategy[]).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setStrategy(s)}
                  className={cx(
                    "flex flex-col items-start gap-1 rounded-xl border p-3 text-left",
                    strategy === s ? "border-accent" : "border-border",
                  )}
                >
                  <span className="text-xs text-muted">{s === "sell_fast" ? "Fast sale" : "Best price"}</span>
                  <PriceTag cents={listPriceFor(price, s)} className="text-xl" />
                </button>
              ))}
            </div>
          )}
          {modes.includes("rent") && (
            <div className="flex items-center justify-between rounded-xl border border-border p-3">
              <PriceTag cents={price.rentPerDayCents} per="day" className="text-xl" />
              <span className="text-sm text-muted">
                <PriceTag cents={price.depositCents} className="text-foreground" /> deposit
              </span>
            </div>
          )}
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setStep("draft")}>
              Back
            </Button>
            <Button className="flex-1" onClick={() => setStep("floor")}>
              Looks good
            </Button>
          </div>
        </Card>
      )}

      {step === "floor" && price && (
        <Card className="flex flex-col gap-4">
          <div className="flex items-center gap-2">
            <span aria-hidden>🔒</span>
            <h2 className="font-semibold">Set your floor</h2>
          </div>
          <p className="text-sm text-muted">
            The lowest price you&apos;d accept. Hallway never reveals this to buyers or to the AI; it only stops a deal
            going lower.
          </p>
          <label className="flex flex-col gap-1 text-sm">
            <span>
              Floor <span className="text-muted">(list price {formatCents(listCents)})</span>
            </span>
            <input
              inputMode="decimal"
              value={floor}
              onChange={(e) => setFloor(e.target.value)}
              placeholder="$25"
              className={cx(field, floorProblem && "border-danger")}
            />
          </label>
          {floorProblem && <p className="text-sm text-danger">{floorProblem}</p>}
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setStep("price")}>
              Back
            </Button>
            <Button className="flex-1" onClick={publish} disabled={busy || !floor || !!floorProblem}>
              {busy ? "Publishing…" : "Publish"}
            </Button>
          </div>
        </Card>
      )}

      {step === "done" && (
        <Card className="flex flex-col items-center gap-2 py-8 text-center">
          <Chip tone="success">Live</Chip>
          <p className="font-medium">{draft?.title} is listed. Hallway will handle offers for you.</p>
          {!floorSaved && (
            <p className="text-sm text-muted">Your floor will be locked in as soon as the negotiation service is live.</p>
          )}
          {listingId && (
            <a href="/home" className="mt-2 text-sm font-medium text-accent">
              Back to home
            </a>
          )}
        </Card>
      )}

      {error && <p className="text-sm text-danger">{error}</p>}
    </div>
  );
}
