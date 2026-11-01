import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import type { Account } from '../../db/types';
import type { SafeToSpend } from '../../domain/safeToSpend';
import { ACCOUNT_TYPE_LABELS } from '../../lib/format';
import { ACCOUNT_ICONS } from '../../lib/icons';
import { formatMAD } from '../../lib/money';
import { SafeToSpendCard } from './SafeToSpendCard';

interface BalanceCarouselProps {
  safe: SafeToSpend;
  /** Active accounts, in the user's order. */
  accounts: Account[];
  balances: Map<number, number>;
}

/**
 * Home's top card: "Safe to spend" first, then one card per account. Swipe
 * sideways (native scroll-snap) or tap the dots below.
 */
export function BalanceCarousel({ safe, accounts, balances }: BalanceCarouselProps) {
  const scroller = useRef<HTMLDivElement>(null);
  const [current, setCurrent] = useState(0);
  const count = accounts.length + 1;

  // Keep the dots in sync with wherever a swipe settles.
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const onScroll = () => {
      const distances = slideOffsets(el).map((x) => Math.abs(x - el.scrollLeft));
      setCurrent(distances.indexOf(Math.min(...distances)));
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, []);

  const goTo = (i: number) => {
    const el = scroller.current;
    if (!el) return;
    const left = slideOffsets(el)[i];
    if (left === undefined) return;
    const smooth = !matchMedia('(prefers-reduced-motion: reduce)').matches;
    el.scrollTo({ left, behavior: smooth ? 'smooth' : 'auto' });
  };

  if (accounts.length === 0) return <SafeToSpendCard data={safe} />;

  return (
    <section aria-roledescription="carousel" aria-label="Balances">
      <div
        ref={scroller}
        className="no-scrollbar relative -mx-4 -my-2 flex snap-x snap-mandatory items-start gap-3 overflow-x-auto overscroll-x-contain px-4 py-2 scroll-px-4"
      >
        <div role="group" aria-roledescription="slide" aria-label={`1 of ${count}: Safe to spend`} className="w-full shrink-0 snap-start">
          <SafeToSpendCard data={safe} />
        </div>
        {accounts.map((a, i) => (
          <div key={a.id} role="group" aria-roledescription="slide" aria-label={`${i + 2} of ${count}: ${a.name}`} className="w-full shrink-0 snap-start">
            <AccountCard account={a} balance={balances.get(a.id) ?? 0} />
          </div>
        ))}
      </div>

      <div className="mt-1 flex justify-center">
        {Array.from({ length: count }, (_, i) => (
          <button
            key={i}
            type="button"
            onClick={() => goTo(i)}
            aria-label={i === 0 ? 'Show safe to spend' : `Show ${accounts[i - 1]!.name}`}
            aria-current={i === current ? 'true' : undefined}
            className="flex h-6 min-w-6 items-center justify-center px-1"
          >
            <span aria-hidden className={`h-1.5 rounded-full transition-all ${i === current ? 'w-4 bg-accent' : 'w-1.5 bg-border'}`} />
          </button>
        ))}
      </div>
    </section>
  );
}

/** scrollLeft at which each slide is snapped into place. */
function slideOffsets(el: HTMLElement): number[] {
  const slides = [...el.children] as HTMLElement[];
  const first = slides[0]?.offsetLeft ?? 0;
  return slides.map((s) => s.offsetLeft - first);
}

function AccountCard({ account, balance }: { account: Account; balance: number }) {
  const Icon = ACCOUNT_ICONS[account.type];
  const typeLabel = ACCOUNT_TYPE_LABELS[account.type];
  // "Cash · Cash" says nothing twice.
  const label = account.name.trim().toLowerCase() === typeLabel.toLowerCase() ? account.name : `${account.name} · ${typeLabel}`;
  return (
    <Link
      to={`/transactions?account=${account.id}`}
      className="block rounded-card bg-surface p-5 shadow-sm transition hover:brightness-[0.98] active:scale-[0.99]"
    >
      <span className="flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-2 text-sm font-medium text-muted">
          <Icon size={18} aria-hidden className="shrink-0" />
          <span className="truncate">{label}</span>
        </span>
        <span className="flex shrink-0 items-center gap-0.5 text-xs font-medium text-accent">
          Transactions
          <ChevronRight size={16} aria-hidden />
        </span>
      </span>
      <span className={`mt-1 block text-[2.5rem] font-semibold leading-tight tracking-tight ${balance < 0 ? 'text-expense' : ''}`}>
        {formatMAD(balance)}
      </span>
      <span className="mt-1 block text-sm text-muted">{balance < 0 ? 'This account is overdrawn.' : 'Current balance'}</span>
    </Link>
  );
}
