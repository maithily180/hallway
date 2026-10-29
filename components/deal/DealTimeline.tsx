import type { Deal } from '@/lib/contracts';
import { stepsFor } from './steps';

/** PayPal state, step by step. Every reached step shows the PayPal id that caused it. */
export function DealTimeline({ deal }: { deal: Deal }) {
  const steps = stepsFor(deal);
  const reached = new Map(deal.timeline.map((t) => [t.state, t]));

  return (
    <ol className="relative space-y-6 border-l-2 border-stone-200 pl-6">
      {steps.map((step) => {
        const entry = reached.get(step.state);
        const current = deal.state === step.state;
        return (
          <li key={step.state} className="relative">
            <span
              className={[
                'absolute -left-[33px] top-1 h-4 w-4 rounded-full border-2',
                entry ? 'border-amber-600 bg-amber-600' : 'border-stone-300 bg-white',
                current ? 'ring-4 ring-amber-200' : '',
              ].join(' ')}
            />
            <div className="flex flex-wrap items-baseline gap-x-3">
              <h3 className={entry ? 'font-semibold text-stone-900' : 'font-medium text-stone-400'}>
                {step.title}
              </h3>
              {entry && (
                // Server and browser format local time differently; the browser's wins.
                <time className="text-xs text-stone-500" dateTime={entry.at} suppressHydrationWarning>
                  {new Date(entry.at).toLocaleString()}
                </time>
              )}
            </div>
            {step.detail && (
              <p className={entry ? 'text-sm text-stone-700' : 'text-sm text-stone-400'}>{step.detail}</p>
            )}
            {entry?.paypalRef && (
              <p className="mt-1 text-xs text-stone-500">
                PayPal id <code className="rounded bg-stone-100 px-1.5 py-0.5 font-mono">{entry.paypalRef}</code>
              </p>
            )}
          </li>
        );
      })}
    </ol>
  );
}
