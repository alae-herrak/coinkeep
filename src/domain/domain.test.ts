import { describe, expect, it } from 'vitest';
import type { Transaction } from '../db/types';
import { computeAccountBalances, sumBalances } from './balances';
import { compareNewestFirst, countActiveFilters, filterTransactions, groupByDay, normalizeText, type Lookups } from './transactions';
import { moveItem, nextSortOrder } from './reorder';

let nextId = 1;
function tx(partial: Partial<Transaction>): Transaction {
  return {
    id: nextId++,
    type: 'expense',
    amount: 1000,
    accountId: 1,
    toAccountId: null,
    categoryId: 10,
    date: '2026-03-10',
    note: '',
    createdAt: nextId,
    ...partial,
  };
}

describe('computeAccountBalances', () => {
  const accounts = [
    { id: 1, startingBalance: 100000 },
    { id: 2, startingBalance: -5000 },
  ];

  it('applies income, expenses and transfers', () => {
    const balances = computeAccountBalances(accounts, [
      tx({ type: 'income', amount: 300000, accountId: 1, categoryId: 20 }),
      tx({ type: 'expense', amount: 4550, accountId: 1 }),
      tx({ type: 'transfer', amount: 20000, accountId: 1, toAccountId: 2, categoryId: null }),
      tx({ type: 'expense', amount: 1, accountId: 2 }),
    ]);
    expect(balances.get(1)).toBe(100000 + 300000 - 4550 - 20000);
    expect(balances.get(2)).toBe(-5000 + 20000 - 1);
    // Transfers move money between accounts but don't change the total.
    expect(sumBalances(balances)).toBe(100000 - 5000 + 300000 - 4550 - 1);
  });

  it('ignores transactions for unknown accounts', () => {
    const balances = computeAccountBalances(accounts, [tx({ accountId: 99 })]);
    expect(sumBalances(balances)).toBe(95000);
  });
});

describe('filterTransactions', () => {
  const lookups: Lookups = {
    categories: new Map([
      [10, { name: 'Café & Snacks' }],
      [11, { name: 'Groceries' }],
    ]),
    accounts: new Map([
      [1, { name: 'Wallet' }],
      [2, { name: 'CIH Bank' }],
    ]),
  };
  const list = [
    tx({ id: 1, categoryId: 10, amount: 4550, date: '2026-03-01', note: 'Morning coffee' }),
    tx({ id: 2, categoryId: 11, amount: 32000, date: '2026-03-05', accountId: 2 }),
    tx({ id: 3, type: 'income', categoryId: 20, amount: 900000, date: '2026-03-25' }),
    tx({ id: 4, type: 'transfer', categoryId: null, accountId: 1, toAccountId: 2, amount: 10000, date: '2026-04-01' }),
  ];
  const ids = (f: Parameters<typeof filterTransactions>[1]) => filterTransactions(list, f, lookups).map((t) => t.id);

  it('filters by type, category and date range', () => {
    expect(ids({ type: 'expense' })).toEqual([1, 2]);
    expect(ids({ categoryId: 11 })).toEqual([2]);
    expect(ids({ from: '2026-03-05', to: '2026-03-31' })).toEqual([2, 3]);
  });

  it('matches either side of a transfer for the account filter', () => {
    expect(ids({ accountId: 2 })).toEqual([2, 4]);
  });

  it('searches notes, categories and accounts, accent-insensitively', () => {
    expect(ids({ query: 'coffee' })).toEqual([1]);
    expect(ids({ query: 'cafe' })).toEqual([1]);
    expect(ids({ query: 'cih' })).toEqual([2, 4]);
    expect(ids({ query: '  GROC ' })).toEqual([2]);
  });

  it('searches amounts', () => {
    expect(ids({ query: '45,5' })).toEqual([1]);
    expect(ids({ query: '45.50' })).toEqual([1]);
    expect(ids({ query: '9000' })).toEqual([3]);
    expect(ids({ query: '9 000' })).toEqual([3]);
  });

  it('counts active filters', () => {
    expect(countActiveFilters({})).toBe(0);
    expect(countActiveFilters({ type: 'expense', from: '2026-01-01', to: '2026-01-31', query: 'x' })).toBe(2);
  });

  it('normalizes text', () => {
    expect(normalizeText(' Éé ')).toBe('ee');
  });
});

describe('groupByDay', () => {
  it('groups sorted transactions by date with totals that exclude transfers', () => {
    const sorted = [
      tx({ date: '2026-03-02', amount: 500, createdAt: 1 }),
      tx({ date: '2026-03-01', amount: 700 }),
      tx({ date: '2026-03-02', type: 'income', amount: 2000, createdAt: 2 }),
      tx({ date: '2026-03-02', type: 'transfer', amount: 999, createdAt: 3, toAccountId: 2, categoryId: null }),
    ].sort(compareNewestFirst);
    const groups = groupByDay(sorted);
    expect(groups.map((g) => g.date)).toEqual(['2026-03-02', '2026-03-01']);
    expect(groups[0]!.items.map((t) => t.createdAt)).toEqual([3, 2, 1]);
    expect(groups[0]).toMatchObject({ income: 2000, expense: 500, net: 1500 });
    expect(groups[1]).toMatchObject({ income: 0, expense: 700, net: -700 });
  });
});

describe('moveItem', () => {
  const items = [
    { id: 1, sortOrder: 0 },
    { id: 2, sortOrder: 1 },
    { id: 3, sortOrder: 2 },
  ];

  it('moves an item up or down', () => {
    expect(moveItem(items, 2, 'up')).toEqual([
      { id: 2, sortOrder: 0 },
      { id: 1, sortOrder: 1 },
    ]);
    expect(moveItem(items, 2, 'down')).toEqual([
      { id: 3, sortOrder: 1 },
      { id: 2, sortOrder: 2 },
    ]);
  });

  it('does nothing at the edges or for unknown ids', () => {
    expect(moveItem(items, 1, 'up')).toEqual([]);
    expect(moveItem(items, 3, 'down')).toEqual([]);
    expect(moveItem(items, 42, 'up')).toEqual([]);
  });

  it('repairs duplicate or gapped orders', () => {
    const messy = [
      { id: 1, sortOrder: 5 },
      { id: 2, sortOrder: 5 },
      { id: 3, sortOrder: 9 },
    ];
    expect(moveItem(messy, 3, 'up')).toEqual([
      { id: 1, sortOrder: 0 },
      { id: 3, sortOrder: 1 },
      { id: 2, sortOrder: 2 },
    ]);
  });

  it('computes the next sort order', () => {
    expect(nextSortOrder([])).toBe(0);
    expect(nextSortOrder(items)).toBe(3);
  });
});
