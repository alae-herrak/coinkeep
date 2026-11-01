import { beforeEach, describe, expect, it } from 'vitest';
import { db, getSetting } from '../db/db';
import { createAccount, deleteAccount, moveAccount, setAccountArchived } from './accounts';
import { createCategory, deleteCategory, updateCategory } from './categories';
import { completeOnboarding } from './onboarding';
import { deleteTransaction, restoreTransaction, saveTransaction, type TransactionInput } from './transactions';
import { UserFacingError } from './errors';

beforeEach(async () => {
  await db.delete();
  await db.open();
});

async function categoryId(name: string) {
  return (await db.categories.filter((c) => c.name === name).first())!.id;
}

async function setup() {
  const cash = await createAccount({ name: 'Cash', type: 'cash', startingBalance: 50000 });
  const bank = await createAccount({ name: 'Bank', type: 'bank', startingBalance: 0 });
  const groceries = await categoryId('Groceries');
  const salary = await categoryId('Salary');
  const expense = (over: Partial<TransactionInput> = {}): TransactionInput => ({
    type: 'expense',
    amount: 4550,
    accountId: cash,
    toAccountId: null,
    categoryId: groceries,
    date: '2026-03-10',
    note: '',
    ...over,
  });
  return { cash, bank, groceries, salary, expense };
}

describe('saveTransaction', () => {
  it('creates and updates transactions and remembers the account', async () => {
    const { bank, expense } = await setup();
    const id = await saveTransaction(expense({ note: '  milk  ' }));
    const saved = await db.transactions.get(id);
    expect(saved).toMatchObject({ amount: 4550, note: 'milk' });
    expect(await getSetting('lastUsedAccountId')).toBe(saved!.accountId);

    await saveTransaction(expense({ amount: 100, accountId: bank }), id);
    const updated = await db.transactions.get(id);
    expect(updated).toMatchObject({ amount: 100, accountId: bank, createdAt: saved!.createdAt });
    expect(await getSetting('lastUsedAccountId')).toBe(bank);
  });

  it('rejects invalid input with friendly errors', async () => {
    const { cash, salary, expense } = await setup();
    await expect(saveTransaction(expense({ amount: 0 }))).rejects.toBeInstanceOf(UserFacingError);
    await expect(saveTransaction(expense({ amount: 12.5 }))).rejects.toBeInstanceOf(UserFacingError);
    await expect(saveTransaction(expense({ categoryId: null }))).rejects.toThrow('Pick a category');
    await expect(saveTransaction(expense({ categoryId: salary }))).rejects.toThrow('Pick a category');
    await expect(saveTransaction(expense({ date: '2026-02-30' }))).rejects.toThrow('date');
    await expect(
      saveTransaction(expense({ type: 'transfer', categoryId: null, toAccountId: cash })),
    ).rejects.toThrow('different accounts');
    expect(await db.transactions.count()).toBe(0);
  });

  it('strips the category from transfers', async () => {
    const { bank, expense } = await setup();
    const id = await saveTransaction(expense({ type: 'transfer', toAccountId: bank }));
    expect((await db.transactions.get(id))!.categoryId).toBeNull();
  });
});

describe('deleteTransaction / restoreTransaction', () => {
  it('removes linked savings movements and restores everything on undo', async () => {
    const { cash, salary } = await setup();
    const txId = await saveTransaction({
      type: 'income',
      amount: 900000,
      accountId: cash,
      toAccountId: null,
      categoryId: salary,
      date: '2026-03-25',
      note: 'March pay',
    });
    const goalId = await db.savingsGoals.add({ name: 'Trip', icon: 'Plane', color: '#000', targetAmount: null, targetDate: null, archived: false });
    await db.savingsMovements.bulkAdd([
      { goalId, amount: 90000, date: '2026-03-25', note: '', linkedTransactionId: txId },
      { goalId, amount: 5000, date: '2026-03-20', note: 'manual', linkedTransactionId: null },
    ]);

    const deleted = await deleteTransaction(txId);
    expect(deleted?.movements).toHaveLength(1);
    expect(await db.transactions.count()).toBe(0);
    expect(await db.savingsMovements.count()).toBe(1);

    await restoreTransaction(deleted!);
    expect(await db.transactions.get(txId)).toEqual(deleted!.transaction);
    expect(await db.savingsMovements.count()).toBe(2);
  });

  it('returns null for a missing transaction', async () => {
    expect(await deleteTransaction(12345)).toBeNull();
  });
});

describe('accounts', () => {
  it('keeps at least one active account', async () => {
    const { cash, bank } = await setup();
    await setAccountArchived(bank, true);
    await expect(setAccountArchived(cash, true)).rejects.toThrow('at least one');
    await expect(deleteAccount(cash)).rejects.toThrow('at least one');
  });

  it('refuses to delete used accounts', async () => {
    const { cash, expense } = await setup();
    await saveTransaction(expense());
    await expect(deleteAccount(cash)).rejects.toThrow('Archive it instead');
  });

  it('reorders accounts', async () => {
    const { cash, bank } = await setup();
    await moveAccount(bank, 'up');
    const order = (await db.accounts.orderBy('sortOrder').toArray()).map((a) => a.id);
    expect(order).toEqual([bank, cash]);
  });
});

describe('categories', () => {
  it('creates categories at the end and rejects duplicate names', async () => {
    const id = await createCategory({ name: 'Pets', icon: 'Dog', color: '#123456', kind: 'expense' });
    const created = await db.categories.get(id);
    expect(created).toMatchObject({ archived: false, monthlyBudget: null, sortOrder: 10 });
    await expect(createCategory({ name: 'pets', icon: 'Dog', color: '#000', kind: 'expense' })).rejects.toThrow('already');
    // Same name is fine for the other kind.
    await createCategory({ name: 'Pets', icon: 'Dog', color: '#000', kind: 'income' });
    await expect(updateCategory(id, { name: 'Groceries', icon: 'Dog', color: '#000' })).rejects.toThrow('already');
  });

  it('refuses to delete used categories', async () => {
    const { groceries, expense } = await setup();
    await saveTransaction(expense());
    await expect(deleteCategory(groceries)).rejects.toThrow('Archive it instead');
  });
});

describe('completeOnboarding', () => {
  it('creates the account, goal and starting savings', async () => {
    await completeOnboarding({
      account: { name: ' CIH ', type: 'bank', startingBalance: 1200000 },
      goal: { name: 'Emergency fund', icon: 'Umbrella', color: '#4f46e5', targetAmount: 3000000, alreadySaved: 200000 },
    });
    const [account] = await db.accounts.toArray();
    expect(account).toMatchObject({ name: 'CIH', startingBalance: 1200000 });
    expect(await db.savingsMovements.toArray()).toEqual([expect.objectContaining({ amount: 200000 })]);
    expect(await getSetting('onboardingDone')).toBe(true);
    expect(await getSetting('lastUsedAccountId')).toBe(account!.id);
  });

  it('creates a default Cash account when skipped', async () => {
    await completeOnboarding({ account: null, goal: null });
    expect(await db.accounts.toArray()).toEqual([expect.objectContaining({ name: 'Cash', startingBalance: 0 })]);
  });
});
