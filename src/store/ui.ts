/**
 * Cross-screen UI state: the quick-add sheet (opened from the FAB, rows and
 * manifest shortcuts), toasts, and the confirm dialog.
 */
import { create } from 'zustand';
import type { TransactionType } from '../db/types';

interface QuickAddState {
  open: boolean;
  /** Bumped on every open so the sheet resets its form even if it was already open. */
  session: number;
  initialType: TransactionType;
  editId: number | null;
  /** Route the sheet belongs to; navigating elsewhere closes it. */
  openedOn: string;
}

export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface Toast {
  id: number;
  message: string;
  action?: ToastAction;
  tone?: 'default' | 'error';
}

export interface ConfirmRequest {
  title: string;
  message?: string;
  confirmLabel?: string;
  destructive?: boolean;
  resolve: (ok: boolean) => void;
}

interface UIState {
  quickAdd: QuickAddState;
  /** `openedOn` defaults to the current route; deep links pass the route they redirect to. */
  openQuickAdd: (type?: TransactionType, openedOn?: string) => void;
  openEdit: (id: number) => void;
  closeQuickAdd: () => void;

  toasts: Toast[];
  showToast: (toast: Omit<Toast, 'id'>, durationMs?: number) => void;
  dismissToast: (id: number) => void;

  confirmRequest: ConfirmRequest | null;
  setConfirmRequest: (req: ConfirmRequest | null) => void;
}

/** Current hash route without the query, e.g. "/transactions". */
function currentRoute(): string {
  return (typeof location === 'undefined' ? '' : location.hash.slice(1).split('?')[0]) || '/';
}

let toastId = 0;
const toastTimers = new Map<number, ReturnType<typeof setTimeout>>();

export const useUI = create<UIState>((set, get) => ({
  quickAdd: { open: false, session: 0, initialType: 'expense', editId: null, openedOn: '/' },
  openQuickAdd: (type = 'expense', openedOn = currentRoute()) =>
    set((s) => ({ quickAdd: { open: true, session: s.quickAdd.session + 1, initialType: type, editId: null, openedOn } })),
  openEdit: (id) =>
    set((s) => ({ quickAdd: { open: true, session: s.quickAdd.session + 1, initialType: 'expense', editId: id, openedOn: currentRoute() } })),
  closeQuickAdd: () => set((s) => ({ quickAdd: { ...s.quickAdd, open: false } })),

  toasts: [],
  showToast: (toast, durationMs = 5000) => {
    const id = ++toastId;
    // One toast at a time keeps the screen calm; a new one replaces the old.
    for (const t of get().toasts) clearTimeout(toastTimers.get(t.id));
    set({ toasts: [{ ...toast, id }] });
    toastTimers.set(
      id,
      setTimeout(() => get().dismissToast(id), durationMs),
    );
  },
  dismissToast: (id) => {
    clearTimeout(toastTimers.get(id));
    toastTimers.delete(id);
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
  },

  confirmRequest: null,
  setConfirmRequest: (req) => set({ confirmRequest: req }),
}));

/** Promise-based confirm dialog: `if (await confirm({...})) doIt()`. */
export function confirm(options: Omit<ConfirmRequest, 'resolve'>): Promise<boolean> {
  return new Promise((resolve) => {
    useUI.getState().confirmRequest?.resolve(false);
    useUI.getState().setConfirmRequest({ ...options, resolve });
  });
}

export function toast(message: string, action?: ToastAction) {
  useUI.getState().showToast({ message, action });
}

export function toastError(message: string) {
  useUI.getState().showToast({ message, tone: 'error' });
}

/** Short haptic tick where supported (Android Chrome); silently ignored elsewhere. */
export function vibrate(ms = 15) {
  try {
    navigator.vibrate?.(ms);
  } catch {
    // Some browsers throw when vibration is blocked; it's purely cosmetic.
  }
}
