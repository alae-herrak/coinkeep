import { useUI } from '../../store/ui';

/** Renders the current toast just above the tab bar. Announced politely to screen readers. */
export function Toaster() {
  const toasts = useUI((s) => s.toasts);
  const dismiss = useUI((s) => s.dismissToast);

  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 z-50 flex flex-col items-center gap-2 px-4"
      style={{ bottom: 'calc(var(--spacing-tabbar) + env(safe-area-inset-bottom) + 0.75rem)' }}
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          role={t.tone === 'error' ? 'alert' : 'status'}
          className={`pointer-events-auto flex w-full max-w-md items-center gap-3 rounded-2xl px-4 py-2 shadow-lg animate-[toast-in_0.25s_ease-out] ${
            t.tone === 'error' ? 'bg-expense text-white' : 'bg-text text-bg'
          }`}
        >
          <p className="min-h-9 flex-1 py-2 text-sm">{t.message}</p>
          {t.action && (
            <button
              type="button"
              className="min-h-11 rounded-lg px-3 text-sm font-semibold underline-offset-2 hover:underline"
              onClick={() => {
                t.action?.onClick();
                dismiss(t.id);
              }}
            >
              {t.action.label}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
