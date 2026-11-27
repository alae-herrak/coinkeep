import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../db/db';
import { computeAccountBalances } from '../domain/balances';
import { createAccount } from './accounts';
import { createBackup, restoreBackup, validateBackup } from './backup';
import { deleteCategory } from './categories';
import { createDebt, deleteDebt, payDebt, removeDebtPayment, restoreDebt, restoreDebtPayment, updateDebt, type DebtInput } from './debts';
import { deleteTransaction, restoreTransaction } from './transactions';

beforeEach(async () => {
  await db.delete();
  await db.open();
});

async function setup() {
  const bank = await createAccount({ name: 'Bank', type: 'bank', startingBalance: 1_000_000 });
  const wallet = await createAccount({ name: 'Wallet', type: 'cash', startingBalance: 50_000 });
  const shopping = (await db.categories.filter((c) => c.name === 'Shopping').first())!.id;
  const salary = (await db.categories.filter((c) => c.name === 'Salary').first())!.id;
  const input = (over: Partial<DebtInput> = {}): DebtInput => ({ name: 'Laptop', amount: 600_000, categoryId: shopping, date: '2026-11-01', note: '', ...over });
  return { bank, wallet, shopping, salary, input };
}

async function balance(id: number) {
  return computeAccountBalances(await db.accounts.toArray(), await db.transactions.toArray()).get(id);
}

async function paidOn(debtId: number) {
  const payments = await db.debtPayments.where('debtId').equals(debtId).toArray();
  const txs = await db.transactions.bulkGet(payments.map((p) => p.transactionId));
  return txs.reduce((s, t) => s + (t?.amount ?? 0), 0);
}

describe('debts', () => {
  it('validates input', async () => {
    const { salary, input } = await setup();
    await expect(createDebt(input({ name: ' ' }))).rejects.toThrow('name');
    await expect(createDebt(input({ amount: 0 }))).rejects.toThrow('greater than zero');
    await expect(createDebt(input({ categoryId: salary }))).rejects.toThrow('expense category');
  });

  it('logging a debt moves no money', async () => {
    const { bank, input } = await setup();
    await createDebt(input());
    expect(await db.transactions.count()).toBe(0);
    expect(await balance(bank)).toBe(1_000_000);
  });

  it('pays from the chosen account, with the fee as a separate Fees expense', async () => {
    const { bank, shopping, input } = await setup();
    const id = await createDebt(input());
    const payment = await payDebt(id, { amount: 200_000, accountId: bank, fee: 1_350, date: '2026-11-20' });

    expect(await db.transactions.get(payment.transactionId)).toMatchObject({ type: 'expense', amount: 200_000, accountId: bank, categoryId: shopping, date: '2026-11-20', note: 'Laptop' });
    const fee = await db.transactions.get(payment.feeTransactionId!);
    const fees = await db.categories.get(fee!.categoryId!);
    expect(fees).toMatchObject({ name: 'Fees', kind: 'expense' });
    expect(fee).toMatchObject({ amount: 1_350, accountId: bank, note: 'Laptop · fee' });
    expect(await balance(bank)).toBe(1_000_000 - 201_350);
    expect(await paidOn(id)).toBe(200_000);
    expect((await db.settings.get('lastUsedAccountId'))?.value).toBe(bank);

    // A second fee reuses the same category.
    await payDebt(id, { amount: 100_000, accountId: bank, fee: 500, date: '2026-11-21' });
    expect(await db.categories.filter((c) => c.name === 'Fees').count()).toBe(1);
  });

  it('no fee means no fee transaction', async () => {
    const { wallet, input } = await setup();
    const id = await createDebt(input());
    const payment = await payDebt(id, { amount: 10_000, accountId: wallet, fee: 0, date: '2026-11-20' });
    expect(payment.feeTransactionId).toBeNull();
    expect(await db.transactions.count()).toBe(1);
  });

  it('refuses to overpay or pay a settled debt', async () => {
    const { bank, input } = await setup();
    const id = await createDebt(input({ amount: 100_000 }));
    await expect(payDebt(id, { amount: 100_001, accountId: bank, fee: 0, date: '2026-11-20' })).rejects.toThrow('more than you still owe');
    await payDebt(id, { amount: 100_000, accountId: bank, fee: 0, date: '2026-11-20' });
    await expect(payDebt(id, { amount: 1, accountId: bank, fee: 0, date: '2026-11-20' })).rejects.toThrow('already paid off');
  });

  it('can’t lower the total below what was paid', async () => {
    const { bank, input } = await setup();
    const id = await createDebt(input());
    await payDebt(id, { amount: 300_000, accountId: bank, fee: 0, date: '2026-11-20' });
    await expect(updateDebt(id, input({ amount: 200_000 }))).rejects.toThrow('already paid');
    await updateDebt(id, input({ amount: 300_000, name: 'MacBook' }));
    expect((await db.debts.get(id))!.name).toBe('MacBook');
  });

  it('removing a payment refunds the account and the fee; undo puts it back', async () => {
    const { bank, input } = await setup();
    const id = await createDebt(input());
    const payment = await payDebt(id, { amount: 200_000, accountId: bank, fee: 1_000, date: '2026-11-20' });
    const removed = await removeDebtPayment(payment.id);
    expect(await balance(bank)).toBe(1_000_000);
    expect(await paidOn(id)).toBe(0);
    await restoreDebtPayment(removed!);
    expect(await balance(bank)).toBe(1_000_000 - 201_000);
    expect(await paidOn(id)).toBe(200_000);
  });

  it('deleting the payment transaction unlinks it (and its fee); undo restores all', async () => {
    const { bank, input } = await setup();
    const id = await createDebt(input());
    const payment = await payDebt(id, { amount: 200_000, accountId: bank, fee: 1_000, date: '2026-11-20' });
    const deleted = await deleteTransaction(payment.transactionId);
    expect(await db.debtPayments.count()).toBe(0);
    expect(await db.transactions.count()).toBe(0);
    await restoreTransaction(deleted!);
    expect(await db.debtPayments.get(payment.id)).toEqual(payment);
    expect(await balance(bank)).toBe(1_000_000 - 201_000);
  });

  it('deleting only the fee keeps the payment', async () => {
    const { bank, input } = await setup();
    const id = await createDebt(input());
    const payment = await payDebt(id, { amount: 200_000, accountId: bank, fee: 1_000, date: '2026-11-20' });
    const deleted = await deleteTransaction(payment.feeTransactionId!);
    expect(await db.debtPayments.get(payment.id)).toMatchObject({ feeTransactionId: null });
    expect(await paidOn(id)).toBe(200_000);
    await restoreTransaction(deleted!);
    expect(await db.debtPayments.get(payment.id)).toEqual(payment);
  });

  it('deleting a debt keeps its transactions; undo relinks them', async () => {
    const { bank, input } = await setup();
    const id = await createDebt(input());
    await payDebt(id, { amount: 200_000, accountId: bank, fee: 0, date: '2026-11-20' });
    const deleted = await deleteDebt(id);
    expect(await db.debts.count()).toBe(0);
    expect(await db.debtPayments.count()).toBe(0);
    expect(await db.transactions.count()).toBe(1);
    await restoreDebt(deleted!);
    expect(await paidOn(id)).toBe(200_000);
  });

  it('a category used by a debt can’t be deleted', async () => {
    const { shopping, input } = await setup();
    await createDebt(input());
    await expect(deleteCategory(shopping)).rejects.toThrow('Archive it instead');
  });

  it('round-trips through a backup, and older backups without debts still restore', async () => {
    const { bank, input } = await setup();
    const id = await createDebt(input());
    await payDebt(id, { amount: 200_000, accountId: bank, fee: 1_000, date: '2026-11-20' });
    const backup = await createBackup();
    const result = validateBackup(JSON.stringify(backup));
    expect(result.ok).toBe(true);
    await restoreBackup((result as { ok: true; backup: typeof backup }).backup);
    expect(await db.debts.count()).toBe(1);
    expect(await paidOn(id)).toBe(200_000);

    const old = JSON.parse(JSON.stringify(backup));
    delete old.data.debts;
    delete old.data.debtPayments;
    expect(validateBackup(JSON.stringify(old)).ok).toBe(true);

    const broken = JSON.parse(JSON.stringify(backup));
    broken.data.debtPayments[0].debtId = 999;
    expect(validateBackup(JSON.stringify(broken))).toMatchObject({ ok: false });
  });
});
