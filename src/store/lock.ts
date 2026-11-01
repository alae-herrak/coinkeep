import { create } from 'zustand';

interface LockState {
  /** PIN screen is showing. */
  locked: boolean;
  /** Opaque cover while the app is in the background, so the task switcher shows no balances. */
  covered: boolean;
  lock: () => void;
  unlock: () => void;
  setCovered: (covered: boolean) => void;
}

export const useLock = create<LockState>((set) => ({
  locked: false,
  covered: false,
  lock: () => set({ locked: true }),
  unlock: () => set({ locked: false }),
  setCovered: (covered) => set({ covered }),
}));
