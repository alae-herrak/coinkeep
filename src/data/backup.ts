/**
 * Full-database backup and restore.
 *
 * A backup is one JSON file:
 *   { app: "coinkeep", format: 1, schemaVersion, exportedAt, data: { <table>: rows[] } }
 *
 * Restoring replaces everything on the device in a single IndexedDB
 * transaction, after strict validation (types, whole-centime money, real
 * dates, unique ids, and every reference pointing at an existing row), so a
 * damaged or hand-edited file can never leave the app half-restored.
 *
 * Device-specific settings (PIN, theme, storage status) are never exported or
 * overwritten: restoring someone's backup can't lock you out of your phone.
 */
import { db, setSetting } from '../db/db';
import type {
  Account,
  Category,
  PaycheckTemplate,
  RecurringBill,
  SavingsGoal,
  SavingsMovement,
  SettingKey,
  SettingRow,
  Transaction,
} from '../db/types';
import { buildSeedCategories } from '../db/seed';
import { isISODate } from '../lib/dates';

export const BACKUP_APP = 'coinkeep';
export const BACKUP_FORMAT = 1;

export interface BackupData {
  accounts: Account[];
  categories: Category[];
  transactions: Transaction[];
  savingsGoals: SavingsGoal[];
  savingsMovements: SavingsMovement[];
  recurringBills: RecurringBill[];
  paycheckTemplates: PaycheckTemplate[];
  settings: SettingRow[];
}

export interface Backup {
  app: typeof BACKUP_APP;
  format: number;
  schemaVersion: number;
  exportedAt: string;
  data: BackupData;
}

/** Settings that travel with a backup. Everything else stays tied to the device. */
const PORTABLE_SETTINGS: SettingKey[] = ['lastUsedAccountId', 'installedAt'];

export async function createBackup(now: Date = new Date()): Promise<Backup> {
  return db.transaction('r', [db.accounts, db.categories, db.transactions, db.savingsGoals, db.savingsMovements, db.recurringBills, db.paycheckTemplates, db.settings], async () => ({
    app: BACKUP_APP,
    format: BACKUP_FORMAT,
    schemaVersion: db.verno,
    exportedAt: now.toISOString(),
    data: {
      accounts: await db.accounts.toArray(),
      categories: await db.categories.toArray(),
      transactions: await db.transactions.toArray(),
      savingsGoals: await db.savingsGoals.toArray(),
      savingsMovements: await db.savingsMovements.toArray(),
      recurringBills: await db.recurringBills.toArray(),
      paycheckTemplates: await db.paycheckTemplates.toArray(),
      settings: (await db.settings.toArray()).filter((s) => PORTABLE_SETTINGS.includes(s.key)),
    },
  }));
}

export function backupFileName(now: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `coinkeep-backup-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}.json`;
}

// -- validation ------------------------------------------------------------------

export type ValidationResult = { ok: true; backup: Backup } | { ok: false; errors: string[] };

const MAX_ERRORS = 8;

class Checker {
  errors: string[] = [];
  fail(msg: string) {
    if (this.errors.length < MAX_ERRORS) this.errors.push(msg);
  }
}

type Rec = Record<string, unknown>;
const isObj = (v: unknown): v is Rec => typeof v === 'object' && v !== null && !Array.isArray(v);
const isId = (v: unknown): v is number => Number.isSafeInteger(v) && (v as number) > 0;
const isInt = (v: unknown): v is number => Number.isSafeInteger(v);
const isStr = (v: unknown): v is string => typeof v === 'string';
const isBool = (v: unknown): v is boolean => typeof v === 'boolean';
const isDate = (v: unknown): v is string => isStr(v) && isISODate(v);
const oneOf =
  <T extends string>(...values: T[]) =>
  (v: unknown): v is T =>
    values.includes(v as T);
const nullable =
  (check: (v: unknown) => boolean) =>
  (v: unknown): boolean =>
    v === null || check(v);
const optional =
  (check: (v: unknown) => boolean) =>
  (v: unknown): boolean =>
    v === undefined || check(v);

type FieldSpec = Record<string, [check: (v: unknown) => boolean, description: string]>;

const MONEY = 'a whole number of centimes';
const POSITIVE_MONEY: [(v: unknown) => boolean, string] = [(v) => isInt(v) && (v as number) > 0, `${MONEY} above zero`];

const SPECS: Record<Exclude<keyof BackupData, 'settings'>, FieldSpec> = {
  accounts: {
    id: [isId, 'a positive id'],
    name: [isStr, 'text'],
    type: [oneOf('cash', 'bank', 'card', 'other'), 'cash, bank, card or other'],
    startingBalance: [isInt, MONEY],
    archived: [isBool, 'true or false'],
    sortOrder: [isInt, 'a whole number'],
  },
  categories: {
    id: [isId, 'a positive id'],
    name: [isStr, 'text'],
    icon: [isStr, 'text'],
    color: [(v) => isStr(v) && /^#[0-9a-f]{6}$/i.test(v), 'a hex color like #1a2b3c'],
    kind: [oneOf('expense', 'income'), 'expense or income'],
    monthlyBudget: [nullable((v) => isInt(v) && (v as number) > 0), `null or ${MONEY} above zero`],
    archived: [isBool, 'true or false'],
    sortOrder: [isInt, 'a whole number'],
  },
  transactions: {
    id: [isId, 'a positive id'],
    type: [oneOf('income', 'expense', 'transfer'), 'income, expense or transfer'],
    amount: POSITIVE_MONEY,
    accountId: [isId, 'an account id'],
    toAccountId: [nullable(isId), 'null or an account id'],
    categoryId: [nullable(isId), 'null or a category id'],
    date: [isDate, 'a date like 2026-11-01'],
    note: [isStr, 'text'],
    createdAt: [isInt, 'a timestamp'],
  },
  savingsGoals: {
    id: [isId, 'a positive id'],
    name: [isStr, 'text'],
    icon: [isStr, 'text'],
    color: [isStr, 'text'],
    targetAmount: [nullable((v) => isInt(v) && (v as number) > 0), `null or ${MONEY} above zero`],
    targetDate: [nullable(isDate), 'null or a date'],
    archived: [isBool, 'true or false'],
  },
  savingsMovements: {
    id: [isId, 'a positive id'],
    goalId: [isId, 'a goal id'],
    amount: [(v) => isInt(v) && v !== 0, `${MONEY}, not zero`],
    date: [isDate, 'a date like 2026-11-01'],
    note: [isStr, 'text'],
    linkedTransactionId: [nullable(isId), 'null or a transaction id'],
  },
  recurringBills: {
    id: [isId, 'a positive id'],
    name: [isStr, 'text'],
    amount: POSITIVE_MONEY,
    categoryId: [isId, 'a category id'],
    accountId: [isId, 'an account id'],
    frequency: [oneOf('weekly', 'monthly', 'yearly'), 'weekly, monthly or yearly'],
    nextDueDate: [isDate, 'a date like 2026-11-01'],
    anchorDay: [optional((v) => isInt(v) && (v as number) >= 1 && (v as number) <= 31), 'a day of the month (1–31)'],
    active: [isBool, 'true or false'],
  },
  paycheckTemplates: {
    id: [isId, 'a positive id'],
    source: [isStr, 'text'],
    defaultAmount: [(v) => isInt(v) && (v as number) >= 0, MONEY],
    accountId: [isId, 'an account id'],
    allocations: [Array.isArray, 'a list'],
  },
};

function checkRows(c: Checker, table: keyof typeof SPECS, rows: unknown): Rec[] {
  if (!Array.isArray(rows)) {
    c.fail(`“${table}” is missing or isn’t a list.`);
    return [];
  }
  const spec = SPECS[table];
  const ids = new Set<number>();
  rows.forEach((row, i) => {
    if (!isObj(row)) {
      c.fail(`${table}[${i}] isn’t an object.`);
      return;
    }
    for (const [field, [check, description]] of Object.entries(spec)) {
      if (!check(row[field])) c.fail(`${table}[${i}].${field} should be ${description}.`);
    }
    if (isId(row.id)) {
      if (ids.has(row.id)) c.fail(`${table} has two rows with id ${row.id}.`);
      ids.add(row.id);
    }
  });
  return rows.filter(isObj);
}

function checkSettings(c: Checker, rows: unknown): SettingRow[] {
  if (rows === undefined) return [];
  if (!Array.isArray(rows)) {
    c.fail('“settings” isn’t a list.');
    return [];
  }
  // Unknown or device-specific keys are ignored rather than rejected.
  return rows.filter(
    (r): r is SettingRow => isObj(r) && PORTABLE_SETTINGS.includes(r.key as SettingKey) && (r.value === null || isInt(r.value)),
  );
}

/** Parses and fully validates a backup file's text. Never throws. */
export function validateBackup(text: string): ValidationResult {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { ok: false, errors: ['This file isn’t valid JSON. Pick a Coinkeep backup (.json).'] };
  }
  if (!isObj(json) || json.app !== BACKUP_APP) {
    return { ok: false, errors: ['This doesn’t look like a Coinkeep backup.'] };
  }
  if (!isInt(json.format) || json.format > BACKUP_FORMAT) {
    return { ok: false, errors: ['This backup was made by a newer version of Coinkeep. Update the app, then try again.'] };
  }
  if (!isInt(json.schemaVersion) || !isStr(json.exportedAt) || !isObj(json.data)) {
    return { ok: false, errors: ['The backup file is incomplete.'] };
  }

  const c = new Checker();
  const d = json.data;
  const accounts = checkRows(c, 'accounts', d.accounts);
  const categories = checkRows(c, 'categories', d.categories);
  const transactions = checkRows(c, 'transactions', d.transactions);
  const goals = checkRows(c, 'savingsGoals', d.savingsGoals);
  const movements = checkRows(c, 'savingsMovements', d.savingsMovements);
  const bills = checkRows(c, 'recurringBills', d.recurringBills);
  const templates = checkRows(c, 'paycheckTemplates', d.paycheckTemplates);
  const settings = checkSettings(c, d.settings);
  if (c.errors.length) return { ok: false, errors: c.errors };

  // References must point at rows that exist, with the right kind.
  const accountIds = new Set(accounts.map((a) => a.id as number));
  const categoryKind = new Map(categories.map((x) => [x.id as number, x.kind as string]));
  const transactionIds = new Set(transactions.map((t) => t.id as number));
  const goalIds = new Set(goals.map((g) => g.id as number));

  transactions.forEach((t, i) => {
    if (!accountIds.has(t.accountId as number)) c.fail(`transactions[${i}] uses an account that isn’t in the backup.`);
    if (t.type === 'transfer') {
      if (t.toAccountId === null || !accountIds.has(t.toAccountId as number)) c.fail(`transactions[${i}] is a transfer without a valid destination account.`);
      if (t.categoryId !== null) c.fail(`transactions[${i}] is a transfer but has a category.`);
    } else {
      if (categoryKind.get(t.categoryId as number) !== t.type) c.fail(`transactions[${i}] has a missing or mismatched category.`);
      if (t.toAccountId !== null) c.fail(`transactions[${i}] isn’t a transfer but has a destination account.`);
    }
  });
  movements.forEach((m, i) => {
    if (!goalIds.has(m.goalId as number)) c.fail(`savingsMovements[${i}] belongs to a goal that isn’t in the backup.`);
    if (m.linkedTransactionId !== null && !transactionIds.has(m.linkedTransactionId as number)) {
      c.fail(`savingsMovements[${i}] is linked to a transaction that isn’t in the backup.`);
    }
  });
  bills.forEach((b, i) => {
    if (!accountIds.has(b.accountId as number)) c.fail(`recurringBills[${i}] uses an account that isn’t in the backup.`);
    if (categoryKind.get(b.categoryId as number) !== 'expense') c.fail(`recurringBills[${i}] needs an expense category.`);
  });
  templates.forEach((t, i) => {
    if (!accountIds.has(t.accountId as number)) c.fail(`paycheckTemplates[${i}] uses an account that isn’t in the backup.`);
    (t.allocations as unknown[]).forEach((a, j) => {
      const ok =
        isObj(a) &&
        goalIds.has(a.goalId as number) &&
        (a.mode === 'percent' || a.mode === 'fixed') &&
        isInt(a.value) &&
        (a.value as number) >= 0 &&
        (a.mode !== 'percent' || (a.value as number) <= 10_000);
      if (!ok) c.fail(`paycheckTemplates[${i}].allocations[${j}] is invalid.`);
    });
  });
  if (c.errors.length) return { ok: false, errors: c.errors };

  return {
    ok: true,
    backup: {
      app: BACKUP_APP,
      format: json.format,
      schemaVersion: json.schemaVersion,
      exportedAt: json.exportedAt,
      data: {
        accounts: accounts as unknown as Account[],
        categories: categories as unknown as Category[],
        transactions: transactions as unknown as Transaction[],
        savingsGoals: goals as unknown as SavingsGoal[],
        savingsMovements: movements as unknown as SavingsMovement[],
        recurringBills: bills as unknown as RecurringBill[],
        paycheckTemplates: templates as unknown as PaycheckTemplate[],
        settings,
      },
    },
  };
}

export function summarizeBackup(b: Backup) {
  return {
    accounts: b.data.accounts.length,
    transactions: b.data.transactions.length,
    goals: b.data.savingsGoals.length,
    bills: b.data.recurringBills.length,
    categories: b.data.categories.length,
  };
}

// -- restore ---------------------------------------------------------------------

/**
 * Replaces all data with the backup's, atomically. Device-only settings (PIN,
 * theme, storage status, reminders) are kept. Marks onboarding as done.
 */
export async function restoreBackup(backup: Backup): Promise<void> {
  const tables = [db.accounts, db.categories, db.transactions, db.savingsGoals, db.savingsMovements, db.recurringBills, db.paycheckTemplates, db.settings];
  await db.transaction('rw', tables, async () => {
    await Promise.all([
      db.accounts.clear(),
      db.categories.clear(),
      db.transactions.clear(),
      db.savingsGoals.clear(),
      db.savingsMovements.clear(),
      db.recurringBills.clear(),
      db.paycheckTemplates.clear(),
    ]);
    const d = backup.data;
    await db.accounts.bulkAdd(d.accounts);
    await db.categories.bulkAdd(d.categories);
    await db.transactions.bulkAdd(d.transactions);
    await db.savingsGoals.bulkAdd(d.savingsGoals);
    await db.savingsMovements.bulkAdd(d.savingsMovements);
    await db.recurringBills.bulkAdd(d.recurringBills);
    await db.paycheckTemplates.bulkAdd(d.paycheckTemplates);

    for (const key of PORTABLE_SETTINGS) await db.settings.delete(key);
    if (d.settings.length) await db.settings.bulkPut(d.settings);
    // The restored data is as safe as the backup it came from.
    const exported = Date.parse(backup.exportedAt);
    await setSetting('lastBackupAt', Number.isFinite(exported) ? exported : Date.now());
    await setSetting('onboardingDone', true);
  });
}

/** Deletes all money data but keeps device settings; the app returns to onboarding. */
export async function eraseAllData(): Promise<void> {
  const tables = [db.accounts, db.categories, db.transactions, db.savingsGoals, db.savingsMovements, db.recurringBills, db.paycheckTemplates, db.settings];
  await db.transaction('rw', tables, async () => {
    await Promise.all(tables.filter((t) => t !== db.settings).map((t) => t.clear()));
    // Start over with the default categories, like a fresh install.
    await db.categories.bulkAdd(buildSeedCategories());
    for (const key of [...PORTABLE_SETTINGS, 'lastBackupAt', 'backupReminderSnoozedUntil'] as SettingKey[]) await db.settings.delete(key);
    await setSetting('onboardingDone', false);
  });
}
