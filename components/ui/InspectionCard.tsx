import type { InspectionResult } from "@/lib/contracts";
import { Card } from "./Card";
import { Chip } from "./Chip";
import { cx, formatCents } from "./format";

const MIN_CONFIDENCE = 0.6;

function Photo({ src, label, boxes = [] }: { src?: string; label: string; boxes?: InspectionResult["newDamage"] }) {
  return (
    <figure className="flex flex-col gap-1">
      <div className="relative aspect-square overflow-hidden rounded-xl border border-border bg-background">
        {src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} alt={label} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-muted">No photo</div>
        )}
        {boxes.map(
          (d, i) =>
            d.region && (
              <span
                key={i}
                title={d.description}
                className="absolute rounded-md border-2 border-danger bg-danger/10"
                style={{
                  left: `${d.region.x * 100}%`,
                  top: `${d.region.y * 100}%`,
                  width: `${d.region.w * 100}%`,
                  height: `${d.region.h * 100}%`,
                }}
              />
            ),
        )}
      </div>
      <figcaption className="text-xs text-muted">{label}</figcaption>
    </figure>
  );
}

/** Before/after photos with damage boxed, confidence and the proposed deduction (a proposal; people decide). */
export function InspectionCard({
  result,
  before,
  after,
  depositCents,
  className,
}: {
  result: InspectionResult;
  before: string[];
  after: string[];
  depositCents?: number;
  className?: string;
}) {
  const pairs = Math.max(before.length, after.length, 1);
  const unsure = result.confidence < MIN_CONFIDENCE;
  const clean = result.newDamage.length === 0 && result.missingParts.length === 0;
  return (
    <Card className={cx("flex flex-col gap-4", className)}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-semibold">Return inspection</h3>
        <div className="flex flex-wrap gap-2">
          {!result.sameItem && <Chip tone="danger">May not be the same item</Chip>}
          <Chip tone={clean ? "success" : "danger"}>{clean ? "No new damage" : "Changes found"}</Chip>
          <Chip tone={unsure ? "neutral" : "accent"}>{Math.round(result.confidence * 100)}% confident</Chip>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        {Array.from({ length: pairs }, (_, i) => (
          <div key={i} className="grid grid-cols-2 gap-3">
            <Photo src={before[i]} label={`Before ${i + 1}`} />
            <Photo
              src={after[i]}
              label={`After ${i + 1}`}
              boxes={result.newDamage.filter((d) => d.photoIndex === i)}
            />
          </div>
        ))}
      </div>

      <p className="text-sm">{result.summary}</p>

      {(result.newDamage.length > 0 || result.missingParts.length > 0) && (
        <ul className="flex flex-col gap-1 text-sm">
          {result.newDamage.map((d, i) => (
            <li key={`d${i}`}>• {d.description} (after photo {d.photoIndex + 1})</li>
          ))}
          {result.missingParts.map((p) => (
            <li key={p}>• Missing: {p}</li>
          ))}
        </ul>
      )}

      <div className="flex items-center justify-between rounded-xl bg-background px-3 py-2 text-sm">
        <span>Proposed deduction</span>
        <span className="font-semibold tabular-nums">
          {formatCents(result.proposedDeductionCents)}
          {depositCents !== undefined && <span className="font-normal text-muted"> of {formatCents(depositCents)} deposit</span>}
        </span>
      </div>
      {unsure && (
        <p className="text-xs text-muted">The inspector is unsure, so it proposes no deduction. Compare the photos yourselves.</p>
      )}
      <p className="text-xs text-muted">This is a proposal. The owner and renter both confirm before any money moves.</p>
    </Card>
  );
}
