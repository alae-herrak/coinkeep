import { useEffect, useRef } from 'react';
import { Navigate, Outlet, ScrollRestoration, useLocation, useParams } from 'react-router-dom';
import { Plus } from 'lucide-react';
import type { TransactionType } from '../../db/types';
import { useUI } from '../../store/ui';
import { QuickAddSheet } from '../quickadd/QuickAddSheet';
import { TabBar } from './TabBar';

/** Screens that show the floating "+" button. */
const FAB_PATHS = new Set(['/', '/transactions']);

/** Shell for the tabbed screens: scrollable content above a fixed bottom tab bar. */
export function AppLayout() {
  const { pathname } = useLocation();
  const openQuickAdd = useUI((s) => s.openQuickAdd);
  const closeQuickAdd = useUI((s) => s.closeQuickAdd);

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
      <main className="pt-safe px-safe pb-tabbar mx-auto max-w-xl">
        <div key={pathname} className="page-in">
          <Outlet />
        </div>
      </main>

      {FAB_PATHS.has(pathname) && (
        <button
          type="button"
          onClick={() => openQuickAdd('expense')}
          aria-label="Add transaction"
          title="Add transaction"
          className="fixed z-30 flex h-14 w-14 items-center justify-center rounded-2xl bg-accent text-accent-fg shadow-lg shadow-accent/30 transition hover:brightness-110 active:scale-95"
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
