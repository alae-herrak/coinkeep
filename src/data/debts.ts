import { db, setSetting } from '../db/db';
import type { Debt, DebtPayment, ISODate, Transaction } from '../db/types';
import { debtStatuses } from '../domain/debts';
import { isISODate } from '../lib/dates';
import { UserFacingError } from './errors';

export type DebtInput = Pick<Debt, 'name' | 'amount' | 'categoryId' | 'date' | 'note'>;

/** Expense category that payment fees are filed under; created the first time a fee is recorded. */
export const FEES_CATEGORY = { name: 'Fees', icon: 'Receipt', color: '#94a3b8' } as const;

async function clean(input: DebtInput): Promise<DebtInput> {
  const name = input.name.trim();
  if (!name) throw new UserFacingError('Give the debt a name.');
  if (!Number.isSafeInteger(input.amount) || input.amount <= 0) throw new UserFacingError('Enter an amount greater than zero.');
  if (!isISODate(input.date)) throw new UserFacingError('Pick a valid date.');
  const category = await db.categories.get(input.categoryId);
  if (!category || category.kind !== 'expense') throw new UserFacingError('Pick an expense category.');
  return { ...input, name, note: input.note.trim() };
}

async function statusOf(debtId: number, amount: number) {
  const payments = await db.debtPayments.where('debtId').equals(debtId).toArray();
  const txIds = payments.flatMap((p) => (p.feeTransactionId === null ? [p.transactionId] : [p.transactionId, p.feeTransactionId]));
  const txs = (await db.transactions.bulkGet(txIds)).filter((t): t is Transaction => t !== undefined);
  return debtStatuses([{ id: debtId, amount }], payments, txs).get(debtId)!;
}

export async function createDebt(input: DebtInput): Promise<number> {
  return db.debts.add(await clean(input));
}

export async function updateDebt(id: number, input: DebtInput): Promise<void> {
  const data = await clean(input);
  await db.transaction('rw', [db.debts, db.debtPayments, db.transactions], async () => {
    if (!(await db.debts.get(id))) throw new UserFacingError('This debt no longer exists.');
    const { paid } = await statusOf(id, data.amount);
    if (data.amount < paid) throw new UserFacingError('The total can’t be less than what you’ve already paid.');
    await db.debts.put({ ...data, id });
  });
}

export interface DeletedDebt {
  debt: Debt;
  payments: DebtPayment[];
}

/** Deletes a debt. Its payments stay in your transactions, just no longer linked. Undo with restoreDebt. */
export async function deleteDebt(id: number): Promise<DeletedDebt | null> {
  return db.transaction('rw', db.debts, db.debtPayments, async () => {
    const debt = await db.debts.get(id);
    if (!debt) return null;
    const payments = await db.debtPayments.where('debtId').equals(id).toArray();
    await db.debtPayments.bulkDelete(payments.map((p) => p.id));
    await db.debts.delete(id);
    return { debt, payments };
  });
}

export async function restoreDebt(deleted: DeletedDebt): Promise<void> {
  await db.transaction('rw', db.debts, db.debtPayments, async () => {
    await db.debts.put(deleted.debt);
    if (deleted.payments.length) await db.debtPayments.bulkPut(deleted.payments);
  });
}

export interface DebtPaymentInput {
  amount: number;
  /** Where the money comes from. */
  accountId: number;
  /** Charged on top (e.g. a bank transfer fee); 0 for none. */
  fee: number;
  date: ISODate;
}

/**
 * Pays a debt down: records the payment as an expense from the chosen account
 * (in the debt's category), plus a separate "Fees" expense for any fee, and
 * links both to the debt. Can't pay more than is still owed.
 */
export async function payDebt(debtId: number, input: DebtPaymentInput): Promise<DebtPayment> {
  if (!Number.isSafeInteger(input.amount) || input.amount <= 0) throw new UserFacingError('Enter an amount greater than zero.');
  if (!Number.isSafeInteger(input.fee) || input.fee < 0) throw new UserFacingError('The fee can’t be negative.');
  if (!isISODate(input.date)) throw new UserFacingError('Pick a valid date.');

  return db.transaction('rw', [db.debts, db.debtPayments, db.transactions, db.accounts, db.categories, db.settings], async () => {
    const debt = await db.debts.get(debtId);
    if (!debt) throw new UserFacingError('This debt no longer exists.');
    if (!(await db.accounts.get(input.accountId))) throw new UserFacingError('Pick the account to pay from.');
    const category = await db.categories.get(debt.categoryId);
    if (!category || category.kind !== 'expense') throw new UserFacingError('The debt’s category no longer exists. Edit the debt first.');
    const { remaining } = await statusOf(debtId, debt.amount);
    if (remaining === 0) throw new UserFacingError('This debt is already paid off.');
    if (input.amount > remaining) throw new UserFacingError('That’s more than you still owe.');

    const now = Date.now();
    const base = { type: 'expense' as const, accountId: input.accountId, toAccountId: null, date: input.date };
    const transactionId = await db.transactions.add({ ...base, amount: input.amount, categoryId: debt.categoryId, note: debt.name, createdAt: now });
    let feeTransactionId: number | null = null;
    if (input.fee > 0) {
      const feesCategoryId = await ensureFeesCategory();
      feeTransactionId = await db.transactions.add({ ...base, amount: input.fee, categoryId: feesCategoryId, note: `${debt.name} · fee`, createdAt: now + 1 });
    }
    const payment = { debtId, transactionId, feeTransactionId };
    const id = await db.debtPayments.add(payment);
    await setSetting('lastUsedAccountId', input.accountId);
    return { ...payment, id };
  });
}

/** The "Fees" expense category, created (or brought back from the archive) when first needed. Call inside a transaction on categories. */
async function ensureFeesCategory(): Promise<number> {
  const expense = await db.categories.where('kind').equals('expense').toArray();
  const existing = expense.find((c) => c.name.trim().toLowerCase() === FEES_CATEGORY.name.toLowerCase());
  if (existing) {
    if (existing.archived) await db.categories.update(existing.id, { archived: false });
    return existing.id;
  }
  const sortOrder = expense.reduce((max, c) => Math.max(max, c.sortOrder), -1) + 1;
  return db.categories.add({ ...FEES_CATEGORY, kind: 'expense', monthlyBudget: null, archived: false, sortOrder });
}

export interface RemovedDebtPayment {
  payment: DebtPayment;
  transactions: Transaction[];
}

/** Removes a payment and its expense(s), so the money is back in the account and the debt is owed again. */
export async function removeDebtPayment(paymentId: number): Promise<RemovedDebtPayment | null> {
  return db.transaction('rw', db.debtPayments, db.transactions, async () => {
    const payment = await db.debtPayments.get(paymentId);
    if (!payment) return null;
    const ids = payment.feeTransactionId === null ? [payment.transactionId] : [payment.transactionId, payment.feeTransactionId];
    const transactions = (await db.transactions.bulkGet(ids)).filter((t): t is Transaction => t !== undefined);
    await db.transactions.bulkDelete(ids);
    await db.debtPayments.delete(paymentId);
    return { payment, transactions };
  });
}

export async function restoreDebtPayment(removed: RemovedDebtPayment): Promise<void> {
  await db.transaction('rw', db.debtPayments, db.transactions, async () => {
    if (removed.transactions.length) await db.transactions.bulkPut(removed.transactions);
    await db.debtPayments.put(removed.payment);
  });
}
