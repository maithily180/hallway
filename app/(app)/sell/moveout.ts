import type { ListingDraft } from "@/lib/contracts";

export const MAX_FRAMES = 8;
export const MIN_DRAFT_CONFIDENCE = 0.3;
const FLOOR_SHARE = 0.8;

/** Evenly spaced capture times in seconds, skipping the very start and end of the clip. */
export function frameTimes(durationSec: number, count = MAX_FRAMES): number[] {
  if (!Number.isFinite(durationSec) || durationSec <= 0) return [];
  const n = Math.max(1, Math.min(count, Math.floor(durationSec)));
  return Array.from({ length: n }, (_, i) => Math.round(((i + 0.5) * durationSec * 100) / n) / 100);
}

export type BulkItem = { key: string; photo: string; draft: ListingDraft };

/** Drops unsure drafts and repeats of the same item (a video shows each thing in several frames), keeping the clearest. */
export function dedupeDrafts(items: BulkItem[]): BulkItem[] {
  const best = new Map<string, BulkItem>();
  for (const item of items) {
    if (item.draft.confidence < MIN_DRAFT_CONFIDENCE) continue;
    const id = `${item.draft.category}|${item.draft.title.trim().toLowerCase()}`;
    const kept = best.get(id);
    if (!kept || item.draft.confidence > kept.draft.confidence) best.set(id, item);
  }
  return [...best.values()];
}

/** Floor for a move-out listing: 80% of the fast-sale price, rounded down to a dollar. */
export function moveOutFloor(fastSaleCents: number): number {
  return Math.floor((fastSaleCents * FLOOR_SHARE) / 100) * 100;
}

/** Captures JPEG frames from a video file in the browser. */
export async function videoFrames(file: File, maxSide = 1280): Promise<string[]> {
  const url = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.src = url;
  try {
    await new Promise<void>((ok, fail) => {
      video.onloadedmetadata = () => ok();
      video.onerror = () => fail(new Error("Could not read that video."));
    });
    const scale = Math.min(1, maxSide / Math.max(video.videoWidth, video.videoHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    const ctx = canvas.getContext("2d")!;
    const frames: string[] = [];
    for (const t of frameTimes(video.duration)) {
      await new Promise<void>((ok) => {
        video.onseeked = () => ok();
        video.currentTime = t;
      });
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      frames.push(canvas.toDataURL("image/jpeg", 0.8));
    }
    return frames;
  } finally {
    URL.revokeObjectURL(url);
  }
}
