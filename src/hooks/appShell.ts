import { useEffect } from 'react';
import { getSetting } from '../db/db';
import { RELOCK_AFTER_MS } from '../lib/pin';
import { requestPersistentStorage } from '../lib/storage';
import { useLock } from '../store/lock';

/**
 * While a PIN is set: cover the app whenever it goes to the background (so the
 * task switcher shows no balances) and lock it again after 30 s away.
 */
export function useAutoLock(pinEnabled: boolean): void {
  useEffect(() => {
    if (!pinEnabled) return;
    const { lock, setCovered } = useLock.getState();
    let hiddenAt: number | null = null;
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        hiddenAt = Date.now();
        setCovered(true);
        return;
      }
      setCovered(false);
      if (hiddenAt !== null && Date.now() - hiddenAt >= RELOCK_AFTER_MS) lock();
      hiddenAt = null;
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      setCovered(false);
    };
  }, [pinEnabled]);
}

/** On first launch, ask the browser not to evict our storage (and remember the answer). */
export function useRequestPersistentStorageOnce(): void {
  useEffect(() => {
    void (async () => {
      if ((await getSetting('storagePersisted')) == null) await requestPersistentStorage();
    })();
  }, []);
}
