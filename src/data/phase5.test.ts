import { beforeEach, describe, expect, it } from 'vitest';
import { db, getSetting, setSetting } from '../db/db';
import { createAccount } from './accounts';
import { createBill } from './bills';
import { addMovement, createGoal } from './goals';
import { logPaycheck, saveTemplate } from './paycheck';
import { saveTransaction } from './transactions';
import { createBackup, eraseAllData, restoreBackup, validateBackup, type Backup } from './backup';
import { centimesToDecimal, csvCell, transactionsToCsv } from './csv';
import { checkPin, removePin, setPin } from './pinSettings';
import { hashPin, isValidPin, lockoutMs, verifyPin } from '../lib/pin';

beforeEach(async () => {
  await db.delete();
  await db.open();
});

async function populate() {
  const bank = await createAccount({ name: 'CIH "Bank"', type: 'bank', startingBalance: 100_000 });
  const cash = await createAccount({ name: 'Wallet', type: 'cash', startingBalance: -500 });
  const cat = async (name: string) => (await db.categories.filter((c) => c.name === name).first())!.id;
  const groceries = await cat('Groceries');
  const salary = await cat('Salary');
  const bills = await cat('Bills & Utilities');
  await db.categories.update(groceries, { monthlyBudget: 150_000 });
  await saveTransaction({ type: 'expense', amount: 4_550, accountId: bank, toAccountId: null, categoryId: groceries, date: '2026-10-03', note: 'Marjane, weekly' });
  await saveTransaction({ type: 'transfer', amount: 20_000, accountId: bank, toAccountId: cash, categoryId: null, date: '2026-10-04', note: '' });
  const goal = await createGoal({ name: 'Trip', icon: 'Plane', color: '#2a78d6', targetAmount: 500_000, targetDate: '2027-06-01' });
  await addMovement(goal, { amount: 10_000, date: '2026-10-05', note: 'start' });
  await logPaycheck({ amount: 900_001, source: 'ACME', accountId: bank, categoryId: salary, date: '2026-10-25', allocations: [{ goalId: goal, mode: 'percent', value: 1250 }] });
  await saveTemplate({ source: 'ACME', defaultAmount: 900_000, accountId: bank, allocations: [{ goalId: goal, mode: 'percent', value: 1250 }] });
  await createBill({ name: 'Internet', amount: 25_000, categoryId: bills, accountId: bank, frequency: 'monthly', nextDueDate: '2026-11-30', active: true });
  await setSetting('lastUsedAccountId', cash);
  return { bank, cash, groceries };
}

async function snapshot() {
  return {
    accounts: await db.accounts.toArray(),
    categories: await db.categories.toArray(),
    transactions: await db.transactions.toArray(),
    savingsGoals: await db.savingsGoals.toArray(),
    savingsMovements: await db.savingsMovements.toArray(),
    recurringBills: await db.recurringBills.toArray(),
    paycheckTemplates: await db.paycheckTemplates.toArray(),
  };
}

describe('backup round-trip', () => {
  it('export → wipe → import restores every row exactly', async () => {
    await populate();
    const before = await snapshot();
    const text = JSON.stringify(await createBackup(new Date('2026-11-01T10:00:00Z')));

    await eraseAllData();
    expect(await db.transactions.count()).toBe(0);
    expect(await getSetting('onboardingDone')).toBe(false);

    const result = validateBackup(text);
    if (!result.ok) throw new Error(result.errors.join('\n'));
    await restoreBackup(result.backup);

    expect(await snapshot()).toEqual(before);
    expect(await getSetting('onboardingDone')).toBe(true);
    expect(await getSetting('lastBackupAt')).toBe(Date.parse('2026-11-01T10:00:00Z'));
    expect(await getSetting('lastUsedAccountId')).toBe(before.accounts[1]!.id);
  });

  it('new rows after a restore get fresh ids', async () => {
    await populate();
    const backup = await createBackup();
    await restoreBackup(backup);
    const maxId = Math.max(...backup.data.transactions.map((t) => t.id));
    const id = await db.transactions.add({ ...backup.data.transactions[0]!, id: undefined as unknown as number });
    expect(id).toBeGreaterThan(maxId);
  });

  it('never exports or overwrites the PIN or theme', async () => {
    await populate();
    await setPin('1234');
    await setSetting('theme', 'dark');
    const backup = await createBackup();
    expect(backup.data.settings.every((s) => ['installedAt', 'lastUsedAccountId'].includes(s.key))).toBe(true);
    expect(JSON.stringify(backup)).not.toContain('pinHash');

    await removePin('1234');
    await setSetting('theme', 'light');
    await restoreBackup(backup);
    expect(await getSetting('pinHash')).toBeNull();
    expect(await getSetting('theme')).toBe('light');
  });
});

describe('validateBackup', () => {
  let good: Backup;
  beforeEach(async () => {
    await populate();
    good = await createBackup();
  });
  const mutate = (fn: (b: Backup) => void) => {
    const copy = JSON.parse(JSON.stringify(good)) as Backup;
    fn(copy);
    return validateBackup(JSON.stringify(copy));
  };
  const errorsOf = (r: ReturnType<typeof validateBackup>) => (r.ok ? [] : r.errors.join(' | '));

  it('accepts a real backup', () => {
    expect(validateBackup(JSON.stringify(good)).ok).toBe(true);
  });

  it('rejects files that are not Coinkeep backups', () => {
    expect(errorsOf(validateBackup('not json'))).toContain('valid JSON');
    expect(errorsOf(validateBackup('{"app":"other"}'))).toContain('doesn’t look like');
    expect(errorsOf(mutate((b) => (b.format = 99)))).toContain('newer version');
  });

  it('rejects floating-point money and bad dates', () => {
    expect(errorsOf(mutate((b) => (b.data.transactions[0]!.amount = 45.5)))).toContain('transactions[0].amount');
    expect(errorsOf(mutate((b) => (b.data.transactions[0]!.date = '2026-02-30')))).toContain('transactions[0].date');
    expect(errorsOf(mutate((b) => (b.data.accounts[0]!.startingBalance = 1.5)))).toContain('startingBalance');
  });

  it('rejects missing tables, duplicate ids and broken references', () => {
    expect(errorsOf(mutate((b) => delete (b.data as Partial<Backup['data']>).accounts))).toContain('“accounts” is missing');
    expect(errorsOf(mutate((b) => (b.data.accounts[1]!.id = b.data.accounts[0]!.id)))).toContain('two rows with id');
    expect(errorsOf(mutate((b) => (b.data.transactions[0]!.accountId = 999)))).toContain('account that isn’t in the backup');
    expect(errorsOf(mutate((b) => (b.data.savingsMovements[0]!.goalId = 999)))).toContain('goal that isn’t in the backup');
    expect(errorsOf(mutate((b) => (b.data.paycheckTemplates[0]!.allocations[0]!.value = 20_000)))).toContain('allocations[0]');
  });

  it('a failed validation leaves the current data untouched', async () => {
    const before = await db.transactions.count();
    const r = mutate((b) => (b.data.transactions[0]!.amount = -1));
    expect(r.ok).toBe(false);
    expect(await db.transactions.count()).toBe(before);
  });
});

describe('CSV export', () => {
  it('formats amounts exactly and escapes text', async () => {
    const ids = await populate();
    const txs = await db.transactions.toArray();
    const accounts = new Map((await db.accounts.toArray()).map((a) => [a.id, a]));
    const categories = new Map((await db.categories.toArray()).map((c) => [c.id, c]));
    const csv = transactionsToCsv(txs, { accounts, categories });
    const lines = csv.trimEnd().split('\r\n');
    expect(lines[0]).toBe('date,type,amount_mad,category,account,to_account,note');
    expect(lines[1]).toBe('2026-10-03,expense,-45.50,Groceries,"CIH ""Bank""",,"Marjane, weekly"');
    expect(lines[2]).toBe('2026-10-04,transfer,200.00,,"CIH ""Bank""",Wallet,');
    expect(lines[3]).toBe('2026-10-25,income,9000.01,Salary,"CIH ""Bank""",,ACME');
    expect(ids).toBeTruthy();
  });

  it('converts centimes without floating point', () => {
    expect(centimesToDecimal(0)).toBe('0.00');
    expect(centimesToDecimal(5)).toBe('0.05');
    expect(centimesToDecimal(-125050)).toBe('-1250.50');
    expect(centimesToDecimal(999_999_999_99)).toBe('999999999.99');
  });

  it('defuses spreadsheet formulas', () => {
    expect(csvCell('=SUM(A1)')).toBe("'=SUM(A1)");
    expect(csvCell('+212600')).toBe("'+212600");
    expect(csvCell('@cmd')).toBe("'@cmd");
    expect(csvCell('plain')).toBe('plain');
  });
});

describe('PIN', () => {
  it('validates PIN format', () => {
    expect(isValidPin('1234')).toBe(true);
    expect(isValidPin('123456')).toBe(true);
    expect(isValidPin('123')).toBe(false);
    expect(isValidPin('1234567')).toBe(false);
    expect(isValidPin('12a4')).toBe(false);
  });

  it('hashes with a salt', async () => {
    const a = await hashPin('1234', 'salt-a');
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(await hashPin('1234', 'salt-b')).not.toBe(a);
    expect(await verifyPin('1234', 'salt-a', a)).toBe(true);
    expect(await verifyPin('1235', 'salt-a', a)).toBe(false);
  });

  it('sets, changes and removes the PIN, requiring the current one', async () => {
    await setPin('1234');
    expect(await getSetting('pinLength')).toBe(4);
    expect(await getSetting('pinHash')).not.toContain('1234');
    expect(await checkPin('1234')).toBe(true);
    await expect(setPin('99999', '0000')).rejects.toThrow('current PIN is wrong');
    await setPin('99999', '1234');
    expect(await checkPin('99999')).toBe(true);
    expect(await getSetting('pinLength')).toBe(5);
    await expect(removePin('1234')).rejects.toThrow();
    await removePin('99999');
    expect(await getSetting('pinHash')).toBeNull();
  });

  it('backs off after repeated failures', () => {
    expect(lockoutMs(1)).toBe(30_000);
    expect(lockoutMs(2)).toBe(60_000);
    expect(lockoutMs(10)).toBe(15 * 60_000);
  });
});
