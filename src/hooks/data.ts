/** Reactive data hooks shared by several screens. They re-render on any DB change. */
import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo } from 'react';
import { db } from '../db/db';
import type { Account, Category, CategoryKind, SettingKey, SettingsMap } from '../db/types';
import { computeAccountBalances } from '../domain/balances';

function bySortOrder<T extends { sortOrder: number; id: number }>(a: T, b: T) {
  return a.sortOrder - b.sortOrder || a.id - b.id;
}

export interface AccountsData {
  all: Account[];
  active: Account[];
  archived: Account[];
  byId: Map<number, Account>;
  balances: Map<number, number>;
}

export function useAccounts(): AccountsData | undefined {
  const raw = useLiveQuery(async () => {
    const [accounts, transactions] = await Promise.all([db.accounts.toArray(), db.transactions.toArray()]);
    return { accounts, balances: computeAccountBalances(accounts, transactions) };
  });
  return useMemo(() => {
    if (!raw) return undefined;
    const all = [...raw.accounts].sort(bySortOrder);
    return {
      all,
      active: all.filter((a) => !a.archived),
      archived: all.filter((a) => a.archived),
      byId: new Map(all.map((a) => [a.id, a])),
      balances: raw.balances,
    };
  }, [raw]);
}

export interface CategoriesData {
  all: Category[];
  byId: Map<number, Category>;
  /** Active categories of a kind, in the user's order. */
  active: (kind: CategoryKind) => Category[];
  archived: (kind: CategoryKind) => Category[];
}

export function useCategories(): CategoriesData | undefined {
  const raw = useLiveQuery(() => db.categories.toArray());
  return useMemo(() => {
    if (!raw) return undefined;
    const all = [...raw].sort(bySortOrder);
    return {
      all,
      byId: new Map(all.map((c) => [c.id, c])),
      active: (kind) => all.filter((c) => c.kind === kind && !c.archived),
      archived: (kind) => all.filter((c) => c.kind === kind && c.archived),
    };
  }, [raw]);
}

/** How often each category was used recently (last 300 transactions), for "most used first". */
export function useCategoryUsage(): Map<number, number> | undefined {
  return useLiveQuery(async () => {
    const recent = await db.transactions.orderBy('createdAt').reverse().limit(300).toArray();
    const counts = new Map<number, number>();
    for (const t of recent) {
      if (t.categoryId !== null) counts.set(t.categoryId, (counts.get(t.categoryId) ?? 0) + 1);
    }
    return counts;
  });
}

export function useSetting<K extends SettingKey>(key: K): SettingsMap[K] | undefined {
  return useLiveQuery(async () => (await db.settings.get(key))?.value as SettingsMap[K] | undefined, [key]);
}
