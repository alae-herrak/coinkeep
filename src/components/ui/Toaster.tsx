import { useUI } from '../../store/ui';

/**
 * Renders the current toast just above the tab bar. Announced politely to screen readers.
 * While the + button is showing, the toast stops short of it so adding the next
 * transaction never means waiting for the toast to go away.
 */
export function Toaster() {
  const toasts = useUI((s) => s.toasts);
  const fabVisible = useUI((s) => s.fabVisible);
  const dismiss = useUI((s) => s.dismissToast);

  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 z-50 flex flex-col items-center gap-2 px-4"
      style={{
        bottom: 'calc(var(--spacing-tabbar) + env(safe-area-inset-bottom) + 1rem)',
        // + button: 3.5rem wide, inset max(1rem, safe area) from the right; keep 0.75rem clear of it.
        paddingRight: fabVisible ? 'calc(max(1rem, env(safe-area-inset-right)) + 4.25rem)' : undefined,
      }}
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
