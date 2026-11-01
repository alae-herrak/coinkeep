/**
 * Chart colors. Values were checked with a color-blind-safety validator
 * (OKLab ΔE under protan/deutan simulation + contrast vs the card surface):
 *
 * - Income vs expenses: green vs neutral slate (ΔE ≥ 10 for deuteranopia).
 *   Green vs red was rejected — ΔE 1.4, i.e. identical for red-green color blindness.
 * - Categories: the default category colors are an 8-hue validated palette;
 *   charts swap in each hue's dark-mode step so it stays in the readable band.
 * - Donuts show at most 6 slices (top 5 + "everything else") and always come
 *   with a labelled list, so identity never depends on color alone.
 */
import { useEffect, useState } from 'react';

export const CHART = {
  light: { income: '#16a34a', expense: '#64748b', rest: '#cbd5e1', grid: '#e3e6ec', axis: '#5d6472', surface: '#ffffff' },
  dark: { income: '#16a34a', expense: '#8590a0', rest: '#3a4150', grid: '#2a2f3a', axis: '#9aa1ae', surface: '#171a21' },
} as const;

export type ChartTheme = (typeof CHART)['light'] | (typeof CHART)['dark'];

/** Validated light → dark steps for the default category palette. */
const DARK_STEPS: Record<string, string> = {
  '#2a78d6': '#3987e5',
  '#eb6834': '#d95926',
  '#1baf7a': '#199e70',
  '#eda100': '#c98500',
  '#e87ba4': '#d55181',
  '#008300': '#008300',
  '#6250d6': '#9085e9',
  '#e34948': '#e66767',
};

export function categoryChartColor(hex: string, dark: boolean): string {
  return dark ? (DARK_STEPS[hex.toLowerCase()] ?? hex) : hex;
}

function isDark() {
  return typeof document !== 'undefined' && document.documentElement.classList.contains('dark');
}

/** Current chart palette; re-renders when the theme class on <html> changes. */
export function useChartTheme(): { dark: boolean; colors: ChartTheme } {
  const [dark, setDark] = useState(isDark);
  useEffect(() => {
    const observer = new MutationObserver(() => setDark(isDark()));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);
  return { dark, colors: dark ? CHART.dark : CHART.light };
}
