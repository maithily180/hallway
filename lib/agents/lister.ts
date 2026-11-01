import { ListingDraftSchema, type ListingDraft, type PhotoUrl } from "@/lib/contracts";
import { llm } from "@/lib/llm";

const SYSTEM = `You write listings for a campus marketplace from a seller's photos and note.
Rules:
- Describe only what is visible or stated. Never invent accessories, specs or usage history.
- List every visible defect (scratches, dents, stains, missing keys) in "defects".
- Anything a buyer would need but you cannot see goes in "missingInfo" as a short question.
- Never put a brand or model name in "title" or "description"; use generic names ("projector", "desk lamp").
  If you recognise the brand or model, put your guess in "brandModelGuess" only.
- "category" is one lowercase generic noun, e.g. projector, desk, bike, textbook, lamp, drill.
- "confidence" (0 to 1) is how sure you are the title, category and condition are right.`;

/** Safe draft returned when the model fails twice; the seller fills it in. */
export function fallbackDraft(note: string): ListingDraft {
  return {
    title: "Untitled item",
    category: "other",
    conditionGrade: "good",
    defects: [],
    description: note.trim(),
    missingInfo: ["Please describe the item"],
    confidence: 0,
  };
}

/** Removes the brand/model guess from customer-facing text. */
export function stripBrand(draft: ListingDraft): ListingDraft {
  const guess = draft.brandModelGuess?.trim();
  if (!guess) return draft;
  const re = new RegExp(`\\s*\\b${guess.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "gi");
  const clean = (s: string) => s.replace(re, "").replace(/\s{2,}/g, " ").trim();
  return { ...draft, title: clean(draft.title) || draft.category, description: clean(draft.description) };
}

/** Lister: photos + a sentence → ListingDraft with defects and missing-info questions. */
export async function draftListing(photos: PhotoUrl[], note: string): Promise<ListingDraft> {
  if (photos.length === 0 && !note.trim()) return fallbackDraft(note);
  const prompt = `Seller's note: ${JSON.stringify(note.trim() || "(none)")}\nDraft the listing.`;
  try {
    const draft = photos.length
      ? await llm.vision(ListingDraftSchema, photos, prompt, { name: "listingDraft", system: SYSTEM })
      : await llm.json(ListingDraftSchema, [{ role: "user", content: prompt }], { name: "listingDraft", system: SYSTEM });
    return stripBrand(draft);
  } catch (err) {
    console.error("draftListing failed", err);
    return fallbackDraft(note);
  }
}
