import Dexie, { type EntityTable, type Table } from 'dexie';
import type {
  Account,
  Category,
  PaycheckTemplate,
  RecurringBill,
  SavingsGoal,
  SavingsMovement,
  SettingKey,
  SettingRow,
  SettingsMap,
  Transaction,
} from './types';
import { seedDatabase } from './seed';

export const DB_NAME = 'coinkeep';

export class CoinkeepDB extends Dexie {
  accounts!: EntityTable<Account, 'id'>;
  categories!: EntityTable<Category, 'id'>;
  transactions!: EntityTable<Transaction, 'id'>;
  savingsGoals!: EntityTable<SavingsGoal, 'id'>;
  savingsMovements!: EntityTable<SavingsMovement, 'id'>;
  recurringBills!: EntityTable<RecurringBill, 'id'>;
  paycheckTemplates!: EntityTable<PaycheckTemplate, 'id'>;
  settings!: Table<SettingRow, SettingKey>;

  constructor(name = DB_NAME) {
    super(name);

    // Schema v1. Only indexed fields are listed; booleans can't be indexed in
    // IndexedDB, so "archived"/"active" are filtered in memory (tables are small).
    // To change the schema later, add a new this.version(2).stores({...}).upgrade(...)
    // below — never edit v1 in place once released.
    this.version(1).stores({
      accounts: '++id, sortOrder',
      categories: '++id, kind, sortOrder',
      transactions: '++id, date, categoryId, accountId, toAccountId, type, createdAt',
      savingsGoals: '++id',
      savingsMovements: '++id, goalId, date, linkedTransactionId',
      recurringBills: '++id, nextDueDate, categoryId, accountId',
      paycheckTemplates: '++id, accountId',
      settings: 'key',
    });

    this.on('populate', (tx) => seedDatabase(tx));
  }
}

export const db = new CoinkeepDB();

export async function getSetting<K extends SettingKey>(key: K): Promise<SettingsMap[K] | undefined>;
export async function getSetting<K extends SettingKey>(key: K, fallback: SettingsMap[K]): Promise<SettingsMap[K]>;
export async function getSetting<K extends SettingKey>(
  key: K,
  fallback?: SettingsMap[K],
): Promise<SettingsMap[K] | undefined> {
  const row = await db.settings.get(key);
  return row ? (row.value as SettingsMap[K]) : fallback;
}

export async function setSetting<K extends SettingKey>(key: K, value: SettingsMap[K]): Promise<void> {
  await db.settings.put({ key, value } as SettingRow);
}
