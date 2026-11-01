import { useId, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import type { SafeToSpend } from '../../domain/safeToSpend';
import { formatShortDate } from '../../lib/format';
import { formatMAD, MINUS_SIGN } from '../../lib/money';
import { useAnimatedNumber } from '../../hooks/useAnimatedNumber';

/** The big "Safe to spend" number with a tap-to-expand explanation of the math. */
export function SafeToSpendCard({ data }: { data: SafeToSpend }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const negative = data.amount < 0;
  const through = formatShortDate(data.through);
  const shown = useAnimatedNumber(data.amount);

  return (
    <section aria-labelledby={`${panelId}-title`} className="overflow-hidden rounded-card bg-accent text-accent-fg shadow-md shadow-accent/20">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((o) => !o)}
        className="block w-full p-5 text-left"
      >
        <span className="flex items-center justify-between gap-2">
          <h2 id={`${panelId}-title`} className="text-sm font-medium opacity-90">
            Safe to spend
          </h2>
          <span className="flex items-center gap-1 text-xs font-medium opacity-80">
            {open ? 'Hide' : 'How is this calculated?'}
            <ChevronDown size={16} aria-hidden className={`transition-transform ${open ? 'rotate-180' : ''}`} />
          </span>
        </span>
        {/* Fixed-width digits only while rolling, so the number doesn't wobble; proportional at rest reads better at this size. */}
        <span className={`mt-1 block text-[2.5rem] font-semibold leading-tight tracking-tight ${shown.animating ? 'tabular' : ''}`}>
          {formatMAD(shown.value)}
        </span>
        <span className="mt-1 block text-sm opacity-90">
          {negative ? 'Your goals and bills add up to more than you have.' : `After savings and bills due by ${through}.`}
        </span>
      </button>

      <div id={panelId} hidden={!open} className="border-t border-white/15 bg-black/10 px-5 pb-5 pt-4 text-sm dark:border-black/10 dark:bg-black/5">
        <dl className="tabular space-y-2">
          <Line label="Money in your accounts" value={formatMAD(data.accountsTotal)} />
          <Line label="Set aside in savings goals" value={`${MINUS_SIGN} ${formatMAD(data.savingsHeld)}`} />
          <Line label={`Bills due by ${through}`} value={`${MINUS_SIGN} ${formatMAD(data.billsTotal)}`} />
          {data.upcomingBills.length > 0 && (
            <div>
              <dt className="sr-only">Bills included</dt>
              <dd>
                <ul className="ml-3 space-y-1 border-l border-white/25 pl-3 text-xs opacity-90 dark:border-black/20">
                  {data.upcomingBills.map((b) => (
                    <li key={b.bill.id} className="flex justify-between gap-2">
                      <span className="truncate">
                        {b.bill.name}
                        {b.dueDates.length > 1 ? ` × ${b.dueDates.length}` : ''} · {formatShortDate(b.dueDates[0]!)}
                      </span>
                      <span className="shrink-0">{formatMAD(b.total)}</span>
                    </li>
                  ))}
                </ul>
              </dd>
            </div>
          )}
          <div className="flex justify-between gap-2 border-t border-white/25 pt-2 font-semibold dark:border-black/20">
            <dt>Safe to spend</dt>
            <dd>{formatMAD(data.amount)}</dd>
          </div>
        </dl>
        <p className="mt-3 text-xs leading-relaxed opacity-90">
          Money in goals stays in your accounts but is kept aside, and unpaid bills due before the end of the month are reserved — so this is what
          you can spend freely today.
        </p>
      </div>
    </section>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2">
      <dt className="opacity-90">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}
