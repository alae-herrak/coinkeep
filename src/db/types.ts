/**
 * Domain types for everything stored in IndexedDB.
 * Money fields are integer centimes (see src/lib/money.ts).
 * Dates are local calendar dates as "YYYY-MM-DD" strings.
 */

export type ISODate = string;

export type AccountType = 'cash' | 'bank' | 'card' | 'other';

export interface Account {
  id: number;
  name: string;
  type: AccountType;
  /** Balance before the first transaction recorded in Coinkeep. May be negative (e.g. a card). */
  startingBalance: number;
  archived: boolean;
  sortOrder: number;
}

export type CategoryKind = 'expense' | 'income';

export interface Category {
  id: number;
  name: string;
  /** Key into the icon registry (src/lib/icons.ts) — a lucide icon name. */
  icon: string;
  /** Hex color, e.g. "#16a34a". */
  color: string;
  kind: CategoryKind;
  /** Monthly budget in centimes; null = no budget. Only meaningful for expense categories. */
  monthlyBudget: number | null;
  archived: boolean;
  sortOrder: number;
}

export type TransactionType = 'income' | 'expense' | 'transfer';

export interface Transaction {
  id: number;
  type: TransactionType;
  /** Always positive; the type decides the direction. */
  amount: number;
  accountId: number;
  /** Destination account, transfers only. */
  toAccountId: number | null;
  /** null for transfers. */
  categoryId: number | null;
  date: ISODate;
  note: string;
  /** Epoch milliseconds. Used to order transactions within a day. */
  createdAt: number;
}

export interface SavingsGoal {
  id: number;
  name: string;
  icon: string;
  color: string;
  targetAmount: number | null;
  targetDate: ISODate | null;
  archived: boolean;
}

export interface SavingsMovement {
  id: number;
  goalId: number;
  /** Positive = allocate to the goal, negative = withdraw from it. */
  amount: number;
  date: ISODate;
  note: string;
  /** The income transaction this allocation came from (paycheck flow), if any. */
  linkedTransactionId: number | null;
}

export type BillFrequency = 'weekly' | 'monthly' | 'yearly';

export interface RecurringBill {
  id: number;
  name: string;
  amount: number;
  categoryId: number;
  accountId: number;
  frequency: BillFrequency;
  nextDueDate: ISODate;
  /**
   * Preferred day of month (1–31) for monthly/yearly bills. Lets a bill due on
   * the 31st go Jan 31 → Feb 28 → Mar 31 instead of drifting to the 28th.
   * Optional (non-indexed) so it needs no schema change; defaults to nextDueDate's day.
   */
  anchorDay?: number;
  active: boolean;
}

export type AllocationMode = 'percent' | 'fixed';

export interface Allocation {
  goalId: number;
  mode: AllocationMode;
  /** percent: basis points (2500 = 25%) to stay integer; fixed: centimes. */
  value: number;
}

export interface PaycheckTemplate {
  id: number;
  source: string;
  defaultAmount: number;
  accountId: number;
  allocations: Allocation[];
}

export type ThemePreference = 'system' | 'light' | 'dark';

/** Known settings keys and their value types. */
export interface SettingsMap {
  theme: ThemePreference;
  pinHash: string | null;
  pinSalt: string | null;
  onboardingDone: boolean;
  lastUsedAccountId: number | null;
  /** Epoch ms of the last successful JSON backup export. */
  lastBackupAt: number | null;
  /** Result of navigator.storage.persist(); null = not requested yet / unsupported. */
  storagePersisted: boolean | null;
  /** Number of PIN digits (4–6), so the lock screen can check as soon as the last digit is typed. */
  pinLength: number | null;
  /** Epoch ms when onboarding finished; used for the first backup reminder. */
  installedAt: number | null;
  /** Epoch ms until which the "back up your data" reminder stays hidden. */
  backupReminderSnoozedUntil: number | null;
}

export type SettingKey = keyof SettingsMap;

export interface SettingRow<K extends SettingKey = SettingKey> {
  key: K;
  value: SettingsMap[K];
}
