/**
 * Persistent storage. Without it the browser may evict IndexedDB under storage
 * pressure — and with it, all your data. Installed PWAs are usually granted
 * persistence; the result is stored so Settings can show it.
 */
import { setSetting } from '../db/db';

export function storageApiAvailable(): boolean {
  return typeof navigator !== 'undefined' && !!navigator.storage?.persist;
}

/** Asks for persistent storage and records the answer. Returns null when unsupported. */
export async function requestPersistentStorage(): Promise<boolean | null> {
  if (!storageApiAvailable()) return null;
  try {
    const granted = (await navigator.storage.persisted()) || (await navigator.storage.persist());
    await setSetting('storagePersisted', granted);
    return granted;
  } catch {
    return null;
  }
}

export async function isStoragePersisted(): Promise<boolean | null> {
  if (!navigator.storage?.persisted) return null;
  try {
    return await navigator.storage.persisted();
  } catch {
    return null;
  }
}

export async function storageEstimate(): Promise<{ usage: number; quota: number } | null> {
  if (!navigator.storage?.estimate) return null;
  try {
    const { usage = 0, quota = 0 } = await navigator.storage.estimate();
    return { usage, quota };
  } catch {
    return null;
  }
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
}
