import { InspectionResultSchema, type InspectionResult, type Listing, type PhotoUrl } from "@/lib/contracts";
import { llm } from "@/lib/llm";
import { formatCents } from "./money";

export const MIN_CONFIDENCE = 0.6;

const SYSTEM = `You compare photos of a rented item taken at handover ("before") and at return ("after").
Report only damage that is visible in an after photo and not in the before photos.
"photoIndex" is the 0-based index within the after photos; "region" is a box in 0..1 image coordinates.
List parts present before but missing after in "missingParts".
Propose a deduction for the owner to review; you never decide. Use 0 when the return is clean.`;

/** Result used when the model fails: no deduction, asks people to compare photos themselves. */
export function fallbackInspection(): InspectionResult {
  return {
    sameItem: true,
    newDamage: [],
    missingParts: [],
    confidence: 0,
    proposedDeductionCents: 0,
    summary: "Automatic inspection was not available; please compare the photos yourselves.",
  };
}

/** Caps the deduction at the deposit and zeroes it when the model is unsure. */
export function enforceInspectionLimits(result: InspectionResult, depositCents: number): InspectionResult {
  const capped = Math.min(Math.max(0, Math.round(result.proposedDeductionCents)), depositCents);
  return { ...result, proposedDeductionCents: result.confidence < MIN_CONFIDENCE ? 0 : capped };
}

/** Inspector: proposes same-item, new damage, missing parts and a deduction; never decides. */
export async function inspectCondition(
  before: PhotoUrl[],
  after: PhotoUrl[],
  listing: Listing,
): Promise<InspectionResult> {
  const deposit = listing.depositCents ?? 0;
  const prompt = [
    `Item: ${listing.title} (${listing.category}).`,
    `Defects already known at listing time: ${listing.defects.join("; ") || "none"}.`,
    `The first ${before.length} images are BEFORE, the next ${after.length} are AFTER.`,
    `The deposit is ${formatCents(deposit)}; any deduction must not exceed it.`,
  ].join("\n");
  try {
    const result = await llm.vision(InspectionResultSchema, [...before, ...after], prompt, {
      name: "inspection",
      system: SYSTEM,
    });
    return enforceInspectionLimits(result, deposit);
  } catch (err) {
    console.error("inspectCondition failed", err);
    return fallbackInspection();
  }
}
