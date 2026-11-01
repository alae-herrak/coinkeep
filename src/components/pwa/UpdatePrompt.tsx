import { RefreshCw, X } from 'lucide-react';
import { useRegisterSW } from 'virtual:pwa-register/react';

/**
 * Registers the service worker and, when a new version has been downloaded,
 * offers to reload. The app never reloads by itself — that could interrupt
 * someone mid-entry.
 */
export function UpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, registration) {
      // Check for updates hourly while the app stays open.
      if (registration) setInterval(() => void registration.update(), 60 * 60 * 1000);
    },
  });

  if (!needRefresh) return null;

  return (
    <div
      role="status"
      className="fixed inset-x-0 z-50 flex justify-center px-4"
      style={{ top: 'calc(env(safe-area-inset-top) + 0.75rem)' }}
    >
      <div className="flex w-full max-w-md items-center gap-3 rounded-2xl bg-text px-4 py-2 text-bg shadow-lg">
        <RefreshCw size={18} aria-hidden className="shrink-0" />
        <p className="flex-1 py-2 text-sm font-medium">New version available</p>
        <button
          type="button"
          onClick={() => void updateServiceWorker(true)}
          className="min-h-11 rounded-lg bg-accent px-3 text-sm font-semibold text-accent-fg"
        >
          Reload
        </button>
        <button type="button" aria-label="Later" onClick={() => setNeedRefresh(false)} className="inline-flex h-11 w-11 items-center justify-center rounded-lg">
          <X size={18} aria-hidden />
        </button>
      </div>
    </div>
  );
}
