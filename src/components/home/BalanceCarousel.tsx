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

/** Fraction of the card width a drag must cover to move to the next card. */
const DISTANCE_THRESHOLD = 0.2;
/** A flick faster than this (px per ms) moves to the next card even if it was short. */
const VELOCITY_THRESHOLD = 0.4;
/** Movement before a touch counts as a horizontal drag (taps stay taps). */
const SLOP = 8;

interface Drag {
  pointerId: number;
  startX: number;
  startY: number;
  startIndex: number;
  startLeft: number;
  lastX: number;
  lastT: number;
  velocity: number;
  horizontal: boolean;
}

/**
 * Home's top card: "Safe to spend" first, then one card per account. Swipe
 * sideways or tap the dots below.
 *
 * Swiping is handled here rather than by native scroll-snap: browsers let a fast
 * fling fly past several cards, while this moves exactly one card per swipe.
 * Vertical page scrolling stays native (touch-action: pan-y).
 */
export function BalanceCarousel({ safe, accounts, balances }: BalanceCarouselProps) {
  const scroller = useRef<HTMLDivElement>(null);
  const [current, setCurrent] = useState(0);
  const currentRef = useRef(0);
  const drag = useRef<Drag | null>(null);
  // Set after a horizontal drag, so the click that ends it doesn't open an account.
  const dragged = useRef(false);
  const count = accounts.length + 1;

  // Keep the dots in sync with the scroll position (swipes, dots, keyboard focus).
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const onScroll = () => {
      const index = nearestIndex(el);
      currentRef.current = index;
      setCurrent(index);
    };
    // Stay on the same card when the width changes (rotation, window resize).
    const resize = new ResizeObserver(() => {
      el.scrollLeft = slideOffsets(el)[currentRef.current] ?? 0;
    });
    // Once a swipe is ours, keep the browser from also running its own fling:
    // it would swallow the next tap ("tap to stop the fling") for about a second.
    const onTouchMove = (e: TouchEvent) => {
      if (drag.current?.horizontal && e.cancelable) e.preventDefault();
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    resize.observe(el);
    return () => {
      el.removeEventListener('scroll', onScroll);
      el.removeEventListener('touchmove', onTouchMove);
      resize.disconnect();
    };
  }, [count]);

  const goTo = (i: number) => {
    const el = scroller.current;
    if (!el) return;
    const index = Math.max(0, Math.min(count - 1, i));
    const left = slideOffsets(el)[index] ?? 0;
    const smooth = !matchMedia('(prefers-reduced-motion: reduce)').matches;
    el.scrollTo({ left, behavior: smooth ? 'smooth' : 'auto' });
  };

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const el = scroller.current;
    if (!el || (e.pointerType === 'mouse' && e.button !== 0)) return;
    dragged.current = false;
    drag.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      startIndex: nearestIndex(el),
      startLeft: el.scrollLeft,
      lastX: e.clientX,
      lastT: e.timeStamp,
      velocity: 0,
      horizontal: false,
    };
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    const el = scroller.current;
    if (!d || !el || e.pointerId !== d.pointerId) return;
    const dx = e.clientX - d.startX;
    if (!d.horizontal) {
      if (Math.abs(dx) < SLOP) return;
      // Mostly vertical: that's the page scrolling, not a swipe.
      if (Math.abs(e.clientY - d.startY) > Math.abs(dx)) {
        drag.current = null;
        return;
      }
      d.horizontal = true;
      dragged.current = true;
      el.setPointerCapture(e.pointerId);
    }
    const dt = e.timeStamp - d.lastT;
    if (dt > 0) d.velocity = (e.clientX - d.lastX) / dt;
    d.lastX = e.clientX;
    d.lastT = e.timeStamp;
    // The card follows the finger.
    el.scrollLeft = d.startLeft - dx;
  };

  const onPointerEnd = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    const el = scroller.current;
    drag.current = null;
    if (!d || !el || !d.horizontal) return;
    const dx = e.clientX - d.startX;
    // A finger that stopped before lifting isn't a flick.
    const velocity = e.timeStamp - d.lastT > 100 ? 0 : d.velocity;
    let target = d.startIndex;
    if (e.type !== 'pointercancel') {
      if (dx < -el.clientWidth * DISTANCE_THRESHOLD || velocity < -VELOCITY_THRESHOLD) target += 1;
      else if (dx > el.clientWidth * DISTANCE_THRESHOLD || velocity > VELOCITY_THRESHOLD) target -= 1;
    }
    goTo(target);
  };

  if (accounts.length === 0) return <SafeToSpendCard data={safe} />;

  return (
    <section aria-roledescription="carousel" aria-label="Balances">
      <div
        ref={scroller}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
        onClickCapture={(e) => {
          if (!dragged.current) return;
          dragged.current = false;
          e.preventDefault();
          e.stopPropagation();
        }}
        className="no-scrollbar relative -mx-4 -my-2 flex touch-pan-y items-start gap-3 overflow-x-hidden px-4 py-2"
      >
        <div role="group" aria-roledescription="slide" aria-label={`1 of ${count}: Safe to spend`} className="w-full shrink-0">
          <SafeToSpendCard data={safe} />
        </div>
        {accounts.map((a, i) => (
          <div key={a.id} role="group" aria-roledescription="slide" aria-label={`${i + 2} of ${count}: ${a.name}`} className="w-full shrink-0">
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

/** Index of the card closest to the current scroll position. */
function nearestIndex(el: HTMLElement): number {
  const distances = slideOffsets(el).map((x) => Math.abs(x - el.scrollLeft));
  return distances.indexOf(Math.min(...distances));
}

/** scrollLeft at which each card sits in place. */
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
