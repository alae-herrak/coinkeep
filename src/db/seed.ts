import type { Transaction as DexieTransaction } from 'dexie';
import type { Category, CategoryKind, SettingRow } from './types';

type SeedCategory = Pick<Category, 'name' | 'icon' | 'color'>;

// Expense colors use the chart palette validated for color-blind separation
// (see src/lib/chartColors.ts); "Other" is deliberately gray.
export const DEFAULT_EXPENSE_CATEGORIES: SeedCategory[] = [
  { name: 'Groceries', icon: 'ShoppingCart', color: '#008300' },
  { name: 'Rent/Housing', icon: 'House', color: '#6250d6' },
  { name: 'Transport', icon: 'Bus', color: '#2a78d6' },
  { name: 'Eating Out', icon: 'Utensils', color: '#eb6834' },
  { name: 'Bills & Utilities', icon: 'Zap', color: '#eda100' },
  { name: 'Health', icon: 'HeartPulse', color: '#e34948' },
  { name: 'Shopping', icon: 'ShoppingBag', color: '#e87ba4' },
  { name: 'Entertainment', icon: 'Clapperboard', color: '#1baf7a' },
  { name: 'Subscriptions', icon: 'Repeat', color: '#0e7490' },
  { name: 'Other', icon: 'Ellipsis', color: '#64748b' },
];

export const DEFAULT_INCOME_CATEGORIES: SeedCategory[] = [
  { name: 'Salary', icon: 'Briefcase', color: '#059669' },
  { name: 'Freelance', icon: 'Laptop', color: '#0d9488' },
  { name: 'Gift', icon: 'Gift', color: '#d97706' },
  { name: 'Other Income', icon: 'Coins', color: '#2563eb' },
];

export function buildSeedCategories(): Omit<Category, 'id'>[] {
  const make = (list: SeedCategory[], kind: CategoryKind) =>
    list.map((c, i) => ({ ...c, kind, monthlyBudget: null, archived: false, sortOrder: i }));
  return [...make(DEFAULT_EXPENSE_CATEGORIES, 'expense'), ...make(DEFAULT_INCOME_CATEGORIES, 'income')];
}

export const DEFAULT_SETTINGS: SettingRow[] = [
  { key: 'theme', value: 'system' },
  { key: 'onboardingDone', value: false },
  { key: 'pinHash', value: null },
  { key: 'pinSalt', value: null },
  { key: 'lastUsedAccountId', value: null },
  { key: 'lastBackupAt', value: null },
  { key: 'storagePersisted', value: null },
  { key: 'pinLength', value: null },
  { key: 'installedAt', value: null },
  { key: 'backupReminderSnoozedUntil', value: null },
];

/** Runs once, inside Dexie's "populate" transaction, when the database is first created. */
export async function seedDatabase(tx: DexieTransaction): Promise<void> {
  await tx.table('categories').bulkAdd(buildSeedCategories());
  await tx.table('settings').bulkAdd(DEFAULT_SETTINGS);
}
