import type { Transaction } from '../db/types';
import { addMonths, endOfMonth } from '../lib/dates';

/** "YYYY-MM" */
export type MonthKey = string;

export function monthOf(date: string): MonthKey {
  return date.slice(0, 7);
}

export function shiftMonth(month: MonthKey, delta: number): MonthKey {
  return addMonths(`${month}-01`, delta).slice(0, 7);
}

export function monthBounds(month: MonthKey): { from: string; to: string } {
  return { from: `${month}-01`, to: endOfMonth(`${month}-01`) };
}

/** The `count` months ending at `last`, oldest first. */
export function monthsEndingAt(last: MonthKey, count: number): MonthKey[] {
  return Array.from({ length: count }, (_, i) => shiftMonth(last, i - count + 1));
}

export function isValidMonth(value: string | null | undefined): value is MonthKey {
  return !!value && /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}

export interface MonthTotals {
  month: MonthKey;
  income: number;
  expense: number;
}

/** Income and expense totals per month (transfers excluded). */
export function totalsByMonth(transactions: readonly Transaction[], months: readonly MonthKey[]): MonthTotals[] {
  const index = new Map(months.map((m) => [m, { month: m, income: 0, expense: 0 }]));
  for (const t of transactions) {
    const bucket = index.get(monthOf(t.date));
    if (!bucket) continue;
    if (t.type === 'income') bucket.income += t.amount;
    if (t.type === 'expense') bucket.expense += t.amount;
  }
  return months.map((m) => index.get(m)!);
}

/** Expense total per category for one month. */
export function spendingByCategory(transactions: readonly Transaction[], month: MonthKey): Map<number, number> {
  const totals = new Map<number, number>();
  for (const t of transactions) {
    if (t.type !== 'expense' || t.categoryId === null || monthOf(t.date) !== month) continue;
    totals.set(t.categoryId, (totals.get(t.categoryId) ?? 0) + t.amount);
  }
  return totals;
}

export interface Slice {
  /** Category id, or null for the folded "everything else" slice. */
  categoryId: number | null;
  amount: number;
  /** 0..1 share of the total. */
  share: number;
}

/**
 * Largest categories first; everything past `maxSlices − 1` folds into one
 * "everything else" slice so a donut never has more than `maxSlices` segments.
 */
export function topSlices(totals: Map<number, number>, maxSlices = 6): Slice[] {
  const entries = [...totals.entries()].filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1] || a[0] - b[0]);
  const total = entries.reduce((s, [, v]) => s + v, 0);
  if (total === 0) return [];
  const keep = entries.length > maxSlices ? entries.slice(0, maxSlices - 1) : entries;
  const slices: Slice[] = keep.map(([categoryId, amount]) => ({ categoryId, amount, share: amount / total }));
  const rest = entries.slice(keep.length).reduce((s, [, v]) => s + v, 0);
  if (rest > 0) slices.push({ categoryId: null, amount: rest, share: rest / total });
  return slices;
}

/** Share of income not spent, or null when there was no income. Can be negative. */
export function savingsRate(income: number, expense: number): number | null {
  if (income <= 0) return null;
  return (income - expense) / income;
}

export type ChangeKind = 'new' | 'stopped' | 'up' | 'down' | 'same';

export interface CategoryChange {
  categoryId: number;
  current: number;
  previous: number;
  diff: number;
  /** Relative change vs previous (null when previous was 0). */
  ratio: number | null;
  kind: ChangeKind;
}

/** Per-category spending change vs the previous month, biggest absolute change first. */
export function compareMonths(current: Map<number, number>, previous: Map<number, number>): CategoryChange[] {
  const ids = new Set([...current.keys(), ...previous.keys()]);
  const changes: CategoryChange[] = [];
  for (const id of ids) {
    const cur = current.get(id) ?? 0;
    const prev = previous.get(id) ?? 0;
    if (cur === 0 && prev === 0) continue;
    const diff = cur - prev;
    const kind: ChangeKind = prev === 0 ? 'new' : cur === 0 ? 'stopped' : diff > 0 ? 'up' : diff < 0 ? 'down' : 'same';
    changes.push({ categoryId: id, current: cur, previous: prev, diff, ratio: prev === 0 ? null : diff / prev, kind });
  }
  return changes.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff) || a.categoryId - b.categoryId);
}
