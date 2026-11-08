import type { Cents } from '@/lib/contracts';
import type { LadderPoint } from '@/lib/negotiation/theater';
import { Chip } from '@/components/ui';
import { usd } from './format';

const BLOCKED_LABEL = {
  injection: 'Attempt blocked',
  off_platform_payment: 'Off-platform payment blocked',
  scam_pattern: 'Scam pattern blocked',
  price_leak: 'Price leak blocked',
} as const;

type PricedKind = 'list' | 'offer' | 'counter' | 'agreed';
interface Row {
  cents: Cents;
  kinds: PricedKind[];
  labels: string[];
  floor?: boolean;
  y: number;
}

// Dot colour when several things sit at one price: the close wins, then our counter.
const PRIORITY: PricedKind[] = ['agreed', 'counter', 'list', 'offer'];

function label(p: Extract<LadderPoint, { cents: number }>): string {
  switch (p.kind) {
    case 'list':
      return 'List price';
    case 'offer':
      return `Buyer offer · round ${p.round}`;
    case 'counter':
      return `Hallway counter · round ${p.round}`;
    case 'agreed':
      return 'Closed';
  }
}

/** Keeps rows readable: at least `gap` percent apart, within the track. */
function spread(rows: Row[], gap: number, min: number, max: number) {
  rows.sort((a, b) => a.y - b.y);
  for (let i = 1; i < rows.length; i++) rows[i].y = Math.max(rows[i].y, rows[i - 1].y + gap);
  if (rows.length && rows[rows.length - 1].y > max) {
    rows[rows.length - 1].y = max;
    for (let i = rows.length - 2; i >= 0; i--) rows[i].y = Math.min(rows[i].y, rows[i + 1].y - gap);
  }
  if (rows.length && rows[0].y < min) rows[0].y = min;
}

/**
 * Live price ladder: list price at the top, every offer and counter, the close.
 * Things at the same price share a row. `floorCents` is passed only to the listing owner;
 * it draws the locked line.
 */
export function PriceLadder({ points, floorCents }: { points: LadderPoint[]; floorCents?: Cents }) {
  const priced = points.filter((p): p is Extract<LadderPoint, { cents: number }> => 'cents' in p);
  const values = [...priced.map((p) => p.cents), ...(floorCents !== undefined ? [floorCents] : [])];
  const top = Math.max(...values);
  const bottom = Math.min(...values);
  const span = Math.max(top - bottom, 1);
  const at = (cents: Cents) => 4 + ((top - cents) / span) * 92; // 4% to 96% of the track

  const byPrice = new Map<Cents, Row>();
  for (const p of priced) {
    const row = byPrice.get(p.cents) ?? { cents: p.cents, kinds: [], labels: [], y: at(p.cents) };
    row.kinds.push(p.kind);
    row.labels.push(label(p));
    byPrice.set(p.cents, row);
  }
  const rows = [...byPrice.values()];
  if (floorCents !== undefined) rows.push({ cents: floorCents, kinds: [], labels: [], floor: true, y: at(floorCents) });
  spread(rows, 7, 4, 96);

  return (
    <div>
      <div className="relative h-80 rounded-2xl border border-border bg-surface-2">
        <div className="absolute bottom-3 left-[3.25rem] top-3 w-px bg-border" />

        {rows.map((row) =>
          row.floor ? (
            <div key="floor" className="absolute inset-x-0 z-10 flex -translate-y-1/2 items-center" style={{ top: `${row.y}%` }}>
              <span className="w-12 pr-2 text-right text-xs font-medium text-danger">{usd(row.cents)}</span>
              <div className="h-0 flex-1 border-t-2 border-dashed border-danger" />
              <Chip tone="danger" className="ml-2 mr-3">
                🔒 Floor · never revealed
              </Chip>
            </div>
          ) : (
            <div key={row.cents} className="absolute inset-x-0 flex -translate-y-1/2 items-center" style={{ top: `${row.y}%` }}>
              <span className="w-12 pr-2 text-right text-xs text-muted">{usd(row.cents)}</span>
              {(() => {
                const kind = PRIORITY.find((k) => row.kinds.includes(k)) ?? 'offer';
                return (
                  <span
                    className={[
                      'z-10 h-3 w-3 -translate-x-[5px] rounded-full border-2',
                      kind === 'agreed'
                        ? 'border-success bg-success'
                        : kind === 'counter'
                          ? 'border-accent bg-accent'
                          : kind === 'list'
                            ? 'border-foreground bg-foreground'
                            : 'border-muted bg-surface',
                    ].join(' ')}
                  />
                );
              })()}
              <span className="ml-3 text-xs">
                {row.labels.map((l, i) => (
                  <span key={i}>
                    {i > 0 && <span className="text-muted"> · </span>}
                    {l === 'Closed' ? <strong className="text-success">Closed</strong> : l}
                  </span>
                ))}
              </span>
            </div>
          ),
        )}
      </div>

      <ul className="mt-3 flex flex-wrap gap-2">
        {points.flatMap((p, i) =>
          p.kind === 'blocked'
            ? [
                <li key={i}>
                  <Chip tone="danger">{BLOCKED_LABEL[p.reason]}</Chip>
                </li>,
              ]
            : [],
        )}
      </ul>
    </div>
  );
}
