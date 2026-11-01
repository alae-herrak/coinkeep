import { describe, expect, it } from 'vitest';
import type { Transaction } from '../db/types';
import {
  compareMonths,
  isValidMonth,
  monthBounds,
  monthsEndingAt,
  savingsRate,
  shiftMonth,
  spendingByCategory,
  topSlices,
  totalsByMonth,
} from './insights';

let id = 1;
const tx = (p: Partial<Transaction>): Transaction => ({
  id: id++,
  type: 'expense',
  amount: 100,
  accountId: 1,
  toAccountId: null,
  categoryId: 1,
  date: '2026-11-05',
  note: '',
  createdAt: 0,
  ...p,
});

describe('month helpers', () => {
  it('shifts months across years', () => {
    expect(shiftMonth('2026-01', -1)).toBe('2025-12');
    expect(shiftMonth('2026-12', 1)).toBe('2027-01');
    expect(monthsEndingAt('2026-02', 6)).toEqual(['2025-09', '2025-10', '2025-11', '2025-12', '2026-01', '2026-02']);
  });

  it('computes bounds and validates keys', () => {
    expect(monthBounds('2028-02')).toEqual({ from: '2028-02-01', to: '2028-02-29' });
    expect(isValidMonth('2026-11')).toBe(true);
    expect(isValidMonth('2026-13')).toBe(false);
    expect(isValidMonth(null)).toBe(false);
  });
});

describe('totals', () => {
  const txs = [
    tx({ date: '2026-10-31', amount: 500 }),
    tx({ date: '2026-11-01', amount: 200 }),
    tx({ date: '2026-11-15', type: 'income', amount: 9000, categoryId: 20 }),
    tx({ date: '2026-11-20', type: 'transfer', amount: 7777, categoryId: null, toAccountId: 2 }),
    tx({ date: '2026-11-21', amount: 300, categoryId: 2 }),
  ];

  it('sums income and expenses per month, ignoring transfers', () => {
    expect(totalsByMonth(txs, ['2026-10', '2026-11', '2026-12'])).toEqual([
      { month: '2026-10', income: 0, expense: 500 },
      { month: '2026-11', income: 9000, expense: 500 },
      { month: '2026-12', income: 0, expense: 0 },
    ]);
  });

  it('sums spending per category for one month', () => {
    expect([...spendingByCategory(txs, '2026-11')]).toEqual([
      [1, 200],
      [2, 300],
    ]);
  });
});

describe('topSlices', () => {
  it('keeps up to 6 slices, folding the tail into one', () => {
    const totals = new Map([
      [1, 100],
      [2, 600],
      [3, 50],
      [4, 300],
      [5, 25],
      [6, 25],
      [7, 900],
      [8, 0],
    ]);
    const slices = topSlices(totals, 6);
    expect(slices.map((s) => s.categoryId)).toEqual([7, 2, 4, 1, 3, null]);
    expect(slices.at(-1)!.amount).toBe(50);
    expect(slices.reduce((s, x) => s + x.share, 0)).toBeCloseTo(1);
  });

  it('does not fold when everything fits', () => {
    const slices = topSlices(new Map([[1, 10], [2, 30]]), 6);
    expect(slices.map((s) => s.categoryId)).toEqual([2, 1]);
    expect(topSlices(new Map())).toEqual([]);
  });
});

describe('savingsRate', () => {
  it('returns the share of income not spent', () => {
    expect(savingsRate(10_000, 7_500)).toBe(0.25);
    expect(savingsRate(10_000, 12_000)).toBe(-0.2);
    expect(savingsRate(0, 500)).toBeNull();
  });
});

describe('compareMonths', () => {
  it('classifies and sorts changes by size', () => {
    const changes = compareMonths(
      new Map([
        [1, 15_000],
        [2, 5_000],
        [3, 2_000],
        [5, 1_000],
      ]),
      new Map([
        [1, 10_000],
        [2, 8_000],
        [4, 4_000],
        [5, 1_000],
      ]),
    );
    expect(changes.map((c) => [c.categoryId, c.kind, c.diff])).toEqual([
      [1, 'up', 5_000],
      [4, 'stopped', -4_000],
      [2, 'down', -3_000],
      [3, 'new', 2_000],
      [5, 'same', 0],
    ]);
    expect(changes[0]!.ratio).toBe(0.5);
    expect(changes.find((c) => c.kind === 'new')!.ratio).toBeNull();
  });
});
