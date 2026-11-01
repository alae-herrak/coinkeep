import { useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import type { ThemePreference } from '../db/types';

const THEME_HINT_KEY = 'coinkeep-theme';
const THEME_COLORS = { light: '#f6f7f9', dark: '#0e1015' } as const;

export function resolveTheme(pref: ThemePreference, systemDark: boolean): 'light' | 'dark' {
  if (pref === 'system') return systemDark ? 'dark' : 'light';
  return pref;
}

function applyTheme(pref: ThemePreference) {
  const media = window.matchMedia('(prefers-color-scheme: dark)');
  const mode = resolveTheme(pref, media.matches);
  document.documentElement.classList.toggle('dark', mode === 'dark');
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLORS[mode]);
}

/**
 * Keeps the <html> class and status-bar color in sync with the saved theme
 * preference and, for "system", with the OS setting.
 */
export function useThemeSync(): void {
  const pref = useLiveQuery(async () => (await db.settings.get('theme'))?.value as ThemePreference | undefined);

  useEffect(() => {
    const current: ThemePreference = pref ?? readThemeHint();
    applyTheme(current);
    try {
      localStorage.setItem(THEME_HINT_KEY, current);
    } catch {
      // Storage may be unavailable (private mode); the theme still applies.
    }
    if (current !== 'system') return;
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => applyTheme('system');
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, [pref]);
}

function readThemeHint(): ThemePreference {
  try {
    const v = localStorage.getItem(THEME_HINT_KEY);
    if (v === 'light' || v === 'dark' || v === 'system') return v;
  } catch {
    // ignore
  }
  return 'system';
}
