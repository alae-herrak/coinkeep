import { useEffect, useRef, useState } from 'react';
import { Navigate, Outlet, ScrollRestoration, useLocation, useParams } from 'react-router-dom';
import { Plus } from 'lucide-react';
import type { TransactionType } from '../../db/types';
import { useUI } from '../../store/ui';
import { QuickAddSheet } from '../quickadd/QuickAddSheet';
import { TabBar } from './TabBar';

/** Screens that show the floating "+" button. */
const FAB_PATHS = new Set(['/', '/transactions']);

/** Scrolled at least this far in one direction before the + button reacts (ignores jitter). */
const SCROLL_THRESHOLD = 10;

/** true while the user is scrolling down the page; false again as soon as they scroll back up. */
function useHiddenWhileScrollingDown(resetKey: string): boolean {
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    setHidden(false);
    let lastY = window.scrollY;
    const onScroll = () => {
      const y = window.scrollY;
      if (Math.abs(y - lastY) < SCROLL_THRESHOLD) return;
      // Always visible near the top of the page.
      setHidden(y > lastY && y > 80);
      lastY = y;
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [resetKey]);
  return hidden;
}

/** Shell for the tabbed screens: scrollable content above a fixed bottom tab bar. */
export function AppLayout() {
  const { pathname } = useLocation();
  const openQuickAdd = useUI((s) => s.openQuickAdd);
  const closeQuickAdd = useUI((s) => s.closeQuickAdd);
  const showFab = FAB_PATHS.has(pathname);
  // The + button would cover the amounts at the end of rows: get out of the way while reading down.
  const fabHidden = useHiddenWhileScrollingDown(pathname);

  // Leaving a screen (e.g. Android back) shouldn't leave the sheet floating over the next one.
  // Only close a sheet that belonged to the screen being left: a deep link opens it for the
  // screen it redirects to, while still passing through its own route.
  const previousPath = useRef(pathname);
  useEffect(() => {
    // The shortcut's redirect route is only passed through; it doesn't count as leaving a screen.
    if (pathname.startsWith('/add/')) return;
    const { open, openedOn } = useUI.getState().quickAdd;
    if (open && openedOn === previousPath.current && openedOn !== pathname) closeQuickAdd();
    previousPath.current = pathname;
  }, [pathname, closeQuickAdd]);

  // Single-page navigation is silent for screen readers: after a navigation (not
  // on first load), move focus to the new screen's heading so it is announced.
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    const raf = requestAnimationFrame(() => {
      if (document.querySelector('dialog[open]')) return;
      document.querySelector<HTMLElement>('main h1')?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(raf);
  }, [pathname]);

  return (
    <div className="min-h-dvh">
      {/* Screens with the + button get extra bottom room so the last row can scroll clear of it. */}
      <main className={`pt-safe px-safe mx-auto max-w-xl ${showFab ? 'pb-tabbar-fab' : 'pb-tabbar'}`}>
        <div key={pathname} className="page-in">
          <Outlet />
        </div>
      </main>

      {showFab && (
        <button
          type="button"
          onClick={() => openQuickAdd('expense')}
          aria-label="Add transaction"
          title="Add transaction"
          // Hidden = slid away and out of the tab order; it returns on scroll up.
          tabIndex={fabHidden ? -1 : undefined}
          aria-hidden={fabHidden || undefined}
          className={`fixed z-30 flex h-14 w-14 items-center justify-center rounded-2xl bg-accent text-accent-fg shadow-lg shadow-accent/30 transition duration-200 hover:brightness-110 active:scale-95 ${
            fabHidden ? 'pointer-events-none translate-y-24 opacity-0' : ''
          }`}
          style={{
            right: 'max(1rem, env(safe-area-inset-right))',
            bottom: 'calc(var(--spacing-tabbar) + env(safe-area-inset-bottom) + 1rem)',
          }}
        >
          <Plus size={28} aria-hidden />
        </button>
      )}

      <TabBar />
      <QuickAddSheet />
      <ScrollRestoration />
    </div>
  );
}

const ADD_TYPES: TransactionType[] = ['expense', 'income', 'transfer'];

/** Deep link target for the "Add expense" home-screen shortcut: #/add/expense → Home with quick-add open. */
export function AddRedirect() {
  const { type } = useParams();
  const openQuickAdd = useUI((s) => s.openQuickAdd);
  const resolved = ADD_TYPES.includes(type as TransactionType) ? (type as TransactionType) : 'expense';
  useEffect(() => openQuickAdd(resolved, '/'), [openQuickAdd, resolved]);
  return <Navigate to="/" replace />;
}
