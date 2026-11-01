import { useEffect, useLayoutEffect, useRef, useState } from 'react';
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
const VELOCITY_THRESHOLD = 0.3;
/** Movement before a touch counts as a horizontal drag (taps stay taps). */
const SLOP = 6;
/** How far past the first/last card a drag can pull, as a fraction of the finger's movement. */
const EDGE_RESISTANCE = 0.3;
/**
 * Settle curve: a strong ease-out whose starting slope is EASE_SLOPE, so the
 * strip leaves the finger at the finger's own speed and then decelerates.
 */
const EASE = 'cubic-bezier(0.2, 0.8, 0.3, 1)';
const EASE_SLOPE = 4;
const MIN_SETTLE_MS = 160;
const MAX_SETTLE_MS = 380;

interface Drag {
  pointerId: number;
  startX: number;
  startY: number;
  lastX: number;
  lastT: number;
  velocity: number;
  horizontal: boolean;
  /** Strip position (px) when the swipe began; may be mid-way through a settle. */
  baseX: number;
}

/**
 * Home's top card: "Safe to spend" first, then one card per account. Swipe
 * sideways or tap the dots below.
 *
 * The strip of cards moves with a transform written straight to the DOM (no
 * React render per frame). A swipe moves exactly one card: past 20% of the
 * width or a quick flick goes to the neighbour, otherwise it springs back.
 * Vertical page scrolling stays native (touch-action: pan-y).
 */
export function BalanceCarousel({ safe, accounts, balances }: BalanceCarouselProps) {
  const viewport = useRef<HTMLDivElement>(null);
  const track = useRef<HTMLDivElement>(null);
  const [current, setCurrent] = useState(0);
  const index = useRef(0);
  const drag = useRef<Drag | null>(null);
  // Set after a horizontal drag, so the click that ends it doesn't open an account.
  const dragged = useRef(false);
  const count = accounts.length + 1;
  const countRef = useRef(count);
  countRef.current = count;

  /** Moves the strip to `x` px; animates over `ms` when given. */
  const placeX = (x: number, ms = 0) => {
    const t = track.current;
    if (!t) return;
    t.style.transition = ms > 0 ? `transform ${ms}ms ${EASE}` : 'none';
    t.style.transform = `translate3d(${x}px, 0, 0)`;
  };
  /** Strip position that shows card `i`. */
  const cardX = (i: number) => (track.current ? -(slideOffsets(track.current)[i] ?? 0) : 0);
  /** Where the strip is right now, including part-way through an animation. */
  const currentX = () => (track.current ? new DOMMatrixReadOnly(getComputedStyle(track.current).transform).m41 : 0);

  /** Settles on card `i`; `velocity` (px/ms) is the finger's speed at release, if any. */
  const settle = (i: number, velocity = 0) => {
    const t = track.current;
    if (!t) return;
    const target = Math.max(0, Math.min(countRef.current - 1, i));
    const distance = Math.abs(cardX(target) - currentX());
    const speed = Math.abs(velocity);
    // Duration such that the curve's starting speed matches the release speed.
    const ms = matchMedia('(prefers-reduced-motion: reduce)').matches
      ? 0
      : Math.round(Math.min(MAX_SETTLE_MS, Math.max(MIN_SETTLE_MS, speed > 0 ? (EASE_SLOPE * distance) / speed : MAX_SETTLE_MS)));
    index.current = target;
    setCurrent(target);
    placeX(cardX(target), distance < 1 ? 0 : ms);
  };

  // Gestures, as native listeners: pointer events drive the drag, and touchmove
  // is cancelled once a swipe is ours so the browser doesn't run its own fling
  // (which would swallow the next tap as "stop the fling").
  useEffect(() => {
    const vp = viewport.current;
    if (!vp) return;

    const onDown = (e: PointerEvent) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      dragged.current = false;
      drag.current = { pointerId: e.pointerId, startX: e.clientX, startY: e.clientY, lastX: e.clientX, lastT: e.timeStamp, velocity: 0, horizontal: false, baseX: 0 };
    };

    const onMove = (e: PointerEvent) => {
      const d = drag.current;
      if (!d || e.pointerId !== d.pointerId) return;
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
        vp.setPointerCapture(e.pointerId);
        // Pick the strip up where it is (it may still be settling from the last
        // swipe). The whole movement so far counts: on a fast flick the first
        // move event alone can be tens of pixels.
        d.baseX = currentX();
      }
      const dt = e.timeStamp - d.lastT;
      if (dt > 0) d.velocity = 0.6 * ((e.clientX - d.lastX) / dt) + 0.4 * d.velocity;
      d.lastX = e.clientX;
      d.lastT = e.timeStamp;
      // Free movement between the first and last card, elastic beyond them.
      const x = d.baseX + (e.clientX - d.startX);
      const min = cardX(countRef.current - 1);
      placeX(x > 0 ? x * EDGE_RESISTANCE : x < min ? min + (x - min) * EDGE_RESISTANCE : x);
    };

    const onEnd = (e: PointerEvent) => {
      const d = drag.current;
      if (!d || e.pointerId !== d.pointerId) return;
      drag.current = null;
      if (!d.horizontal) return;
      // Distance from the card the swipe started on (or is settling towards).
      const dx = currentX() - cardX(index.current);
      // A finger that stopped before lifting isn't a flick.
      const velocity = e.timeStamp - d.lastT > 80 ? 0 : d.velocity;
      let target = index.current;
      if (e.type !== 'pointercancel') {
        if (dx < -vp.clientWidth * DISTANCE_THRESHOLD || velocity < -VELOCITY_THRESHOLD) target += 1;
        else if (dx > vp.clientWidth * DISTANCE_THRESHOLD || velocity > VELOCITY_THRESHOLD) target -= 1;
      }
      settle(target, velocity);
    };

    const onTouchMove = (e: TouchEvent) => {
      if (drag.current?.horizontal && e.cancelable) e.preventDefault();
    };

    const onClick = (e: MouseEvent) => {
      if (!dragged.current) return;
      dragged.current = false;
      e.preventDefault();
      e.stopPropagation();
    };

    // Tabbing to a link on another card: bring that card in with the strip.
    const onFocusIn = (e: FocusEvent) => {
      const slide = (e.target as HTMLElement).closest<HTMLElement>('[data-slide]');
      if (slide && Number(slide.dataset.slide) !== index.current) settle(Number(slide.dataset.slide));
    };
    // ...and undo the browser scrolling the clipped viewport to reveal it.
    const onScroll = () => {
      vp.scrollLeft = 0;
    };

    const resize = new ResizeObserver(() => placeX(cardX(index.current)));

    vp.addEventListener('pointerdown', onDown);
    vp.addEventListener('pointermove', onMove);
    vp.addEventListener('pointerup', onEnd);
    vp.addEventListener('pointercancel', onEnd);
    vp.addEventListener('touchmove', onTouchMove, { passive: false });
    vp.addEventListener('click', onClick, true);
    vp.addEventListener('focusin', onFocusIn);
    vp.addEventListener('scroll', onScroll);
    resize.observe(vp);
    return () => {
      vp.removeEventListener('pointerdown', onDown);
      vp.removeEventListener('pointermove', onMove);
      vp.removeEventListener('pointerup', onEnd);
      vp.removeEventListener('pointercancel', onEnd);
      vp.removeEventListener('touchmove', onTouchMove);
      vp.removeEventListener('click', onClick, true);
      vp.removeEventListener('focusin', onFocusIn);
      vp.removeEventListener('scroll', onScroll);
      resize.disconnect();
    };
    // placeX/settle only read refs; re-attach when the carousel itself appears or goes.
  }, [count > 1]);

  // An account was archived or removed: stay within range.
  useLayoutEffect(() => {
    if (index.current > count - 1) settle(count - 1);
  }, [count]);

  if (accounts.length === 0) return <SafeToSpendCard data={safe} />;

  return (
    <section aria-roledescription="carousel" aria-label="Balances">
      <div ref={viewport} className="-mx-4 -my-2 touch-pan-y overflow-hidden px-4 py-2">
        <div ref={track} className="flex items-start gap-4 will-change-transform">
          <div data-slide={0} role="group" aria-roledescription="slide" aria-label={`1 of ${count}: Safe to spend`} className="w-full shrink-0">
            <SafeToSpendCard data={safe} />
          </div>
          {accounts.map((a, i) => (
            <div
              key={a.id}
              data-slide={i + 1}
              role="group"
              aria-roledescription="slide"
              aria-label={`${i + 2} of ${count}: ${a.name}`}
              className="w-full shrink-0"
            >
              <AccountCard account={a} balance={balances.get(a.id) ?? 0} />
            </div>
          ))}
        </div>
      </div>

      <div className="mt-1 flex justify-center">
        {Array.from({ length: count }, (_, i) => (
          <button
            key={i}
            type="button"
            onClick={() => settle(i)}
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

/** Distance of each card from the first (layout positions, unaffected by the transform). */
function slideOffsets(trackEl: HTMLElement): number[] {
  const slides = [...trackEl.children] as HTMLElement[];
  const first = slides[0]?.offsetLeft ?? 0;
  return slides.map((s) => s.offsetLeft - first);
}

function AccountCard({ account, balance }: { account: Account; balance: number }) {
  const Icon = ACCOUNT_ICONS[account.type];
  const typeLabel = ACCOUNT_TYPE_LABELS[account.type];
  // "Cash · Cash" says nothing twice.
  const label = account.name.trim().toLowerCase() === typeLabel.toLowerCase() ? account.name : `${account.name} · ${typeLabel}`;
  return (
    <Link to={`/transactions?account=${account.id}`} className="block rounded-card bg-surface p-5 shadow-sm">
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
