import type { Cents } from '@/lib/contracts';
import type { LadderPoint } from '@/lib/negotiation/theater';
import { usd } from './format';

const BLOCKED_LABEL = {
  injection: 'Attempt blocked',
  off_platform_payment: 'Off-platform payment blocked',
  scam_pattern: 'Scam pattern blocked',
  price_leak: 'Price leak blocked',
} as const;

/**
 * Live price ladder: list price at the top, every offer and counter, the close.
 * `floorCents` is passed only to the listing owner; it draws the locked line.
 */
export function PriceLadder({ points, floorCents }: { points: LadderPoint[]; floorCents?: Cents }) {
  const priced = points.filter((p): p is Extract<LadderPoint, { cents: number }> => 'cents' in p);
  const values = [...priced.map((p) => p.cents), ...(floorCents !== undefined ? [floorCents] : [])];
  const top = Math.max(...values);
  const bottom = Math.min(...values);
  const span = Math.max(top - bottom, 1);
  // 4% to 96% of the track so markers never touch the edges
  const y = (cents: Cents) => 4 + ((top - cents) / span) * 92;

  return (
    <div>
      <div className="relative h-72 rounded-xl bg-stone-100">
        <div className="absolute bottom-3 left-[3.25rem] top-3 w-px bg-stone-300" />

        {floorCents !== undefined && (
          <div className="absolute inset-x-0 z-10 flex items-center" style={{ top: `${y(floorCents)}%` }}>
            <span className="w-12 pr-2 text-right text-xs font-medium text-red-800">{usd(floorCents)}</span>
            <div className="h-0 flex-1 border-t-2 border-dashed border-red-700" />
            <span className="ml-2 mr-3 rounded-full bg-red-50 px-2 py-0.5 text-xs text-red-800">
              🔒 Floor · never revealed
            </span>
          </div>
        )}

        {priced.map((p, i) => (
          <div key={i} className="absolute inset-x-0 flex items-center" style={{ top: `${y(p.cents)}%` }}>
            <span className="w-12 pr-2 text-right text-xs text-stone-600">{usd(p.cents)}</span>
            <span
              className={[
                'z-10 h-3 w-3 -translate-x-[5px] rounded-full border-2',
                p.kind === 'agreed'
                  ? 'border-emerald-700 bg-emerald-600'
                  : p.kind === 'counter'
                    ? 'border-amber-600 bg-amber-500'
                    : p.kind === 'list'
                      ? 'border-stone-700 bg-stone-700'
                      : 'border-stone-400 bg-white',
              ].join(' ')}
            />
            <span className="ml-3 text-xs text-stone-700">
              {p.kind === 'list' && 'List price'}
              {p.kind === 'offer' && `Buyer offer · round ${p.round}`}
              {p.kind === 'counter' && `Hallway counter · round ${p.round}`}
              {p.kind === 'agreed' && <strong className="text-emerald-800">Closed</strong>}
            </span>
          </div>
        ))}
      </div>

      <ul className="mt-3 flex flex-wrap gap-2">
        {points.flatMap((p, i) =>
          p.kind === 'blocked'
            ? [
                <li key={i} className="rounded-full bg-red-100 px-3 py-1 text-xs font-medium text-red-800">
                  {BLOCKED_LABEL[p.reason]}
                </li>,
              ]
            : [],
        )}
      </ul>
    </div>
  );
}
