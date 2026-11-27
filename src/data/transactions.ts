import { db, setSetting } from '../db/db';
import type { DebtPayment, SavingsMovement, Transaction } from '../db/types';
import { isISODate } from '../lib/dates';
import { UserFacingError } from './errors';

export type TransactionInput = Omit<Transaction, 'id' | 'createdAt'>;

/** Checks a transaction against the current accounts/categories. Throws UserFacingError. */
export async function validateTransaction(input: TransactionInput): Promise<void> {
  if (!Number.isSafeInteger(input.amount) || input.amount <= 0) {
    throw new UserFacingError('Enter an amount greater than zero.');
  }
  if (!isISODate(input.date)) throw new UserFacingError('Pick a valid date.');

  const account = await db.accounts.get(input.accountId);
  if (!account) throw new UserFacingError('Pick an account.');

  if (input.type === 'transfer') {
    if (input.toAccountId === null) throw new UserFacingError('Pick the account to transfer to.');
    if (input.toAccountId === input.accountId) throw new UserFacingError('Choose two different accounts.');
    if (!(await db.accounts.get(input.toAccountId))) throw new UserFacingError('Pick the account to transfer to.');
    if (input.categoryId !== null) throw new UserFacingError('Transfers don’t have a category.');
  } else {
    if (input.categoryId === null) throw new UserFacingError('Pick a category.');
    const category = await db.categories.get(input.categoryId);
    if (!category || category.kind !== input.type) throw new UserFacingError('Pick a category.');
    if (input.toAccountId !== null) throw new UserFacingError('Only transfers have a destination account.');
  }
}

function normalize(input: TransactionInput): TransactionInput {
  const isTransfer = input.type === 'transfer';
  return {
    ...input,
    note: input.note.trim(),
    categoryId: isTransfer ? null : input.categoryId,
    toAccountId: isTransfer ? input.toAccountId : null,
  };
}

/** Creates a transaction (or updates it when `id` is given). Returns its id. */
export async function saveTransaction(input: TransactionInput, id?: number): Promise<number> {
  const clean = normalize(input);
  await validateTransaction(clean);

  const savedId = await db.transaction('rw', db.transactions, db.settings, async () => {
    let resultId: number;
    if (id !== undefined) {
      const existing = await db.transactions.get(id);
      if (!existing) throw new UserFacingError('This transaction no longer exists.');
      await db.transactions.put({ ...clean, id, createdAt: existing.createdAt });
      resultId = id;
    } else {
      resultId = await db.transactions.add({ ...clean, createdAt: Date.now() });
    }
    await setSetting('lastUsedAccountId', clean.accountId);
    return resultId;
  });
  return savedId;
}

/**
 * Creates several transactions at once (a split payment): all are validated
 * first, then saved in one go, so either every part lands or none does.
 * Returns their ids in order.
 */
export async function saveTransactions(inputs: TransactionInput[]): Promise<number[]> {
  const clean = inputs.map(normalize);
  for (const input of clean) await validateTransaction(input);
  if (clean.length === 0) return [];

  return db.transaction('rw', db.transactions, db.settings, async () => {
    const now = Date.now();
    // createdAt keeps the parts in the order they were entered within the day.
    const ids: number[] = [];
    for (const [i, input] of clean.entries()) ids.push(await db.transactions.add({ ...input, createdAt: now + i }));
    await setSetting('lastUsedAccountId', clean[clean.length - 1]!.accountId);
    return ids;
  });
}

/** Everything removed by a delete, so it can be put back exactly (Undo). */
export interface DeletedTransaction {
  transaction: Transaction;
  movements: SavingsMovement[];
  /** Debt payments as they were before (removed, or with the fee unlinked). */
  debtPayments?: DebtPayment[];
  /** A debt payment's fee, deleted along with the payment. */
  extraTransactions?: Transaction[];
}

/**
 * Deletes a transaction together with whatever was built on it: savings
 * movements from a paycheck split, or the debt payment it made (with its fee),
 * so goals and debts never count money that no longer moved.
 */
export async function deleteTransaction(id: number): Promise<DeletedTransaction | null> {
  return db.transaction('rw', [db.transactions, db.savingsMovements, db.debtPayments], async () => {
    const transaction = await db.transactions.get(id);
    if (!transaction) return null;
    const movements = await db.savingsMovements.where('linkedTransactionId').equals(id).toArray();
    await db.savingsMovements.bulkDelete(movements.map((m) => m.id));

    const paid = await db.debtPayments.where('transactionId').equals(id).toArray();
    const feeOf = await db.debtPayments.where('feeTransactionId').equals(id).toArray();
    const extraTransactions: Transaction[] = [];
    for (const p of paid) {
      if (p.feeTransactionId !== null) {
        const fee = await db.transactions.get(p.feeTransactionId);
        if (fee) extraTransactions.push(fee);
        await db.transactions.delete(p.feeTransactionId);
      }
      await db.debtPayments.delete(p.id);
    }
    for (const p of feeOf) await db.debtPayments.update(p.id, { feeTransactionId: null });

    await db.transactions.delete(id);
    return { transaction, movements, debtPayments: [...paid, ...feeOf], extraTransactions };
  });
}

export async function restoreTransaction(deleted: DeletedTransaction): Promise<void> {
  await db.transaction('rw', [db.transactions, db.savingsMovements, db.debtPayments], async () => {
    await db.transactions.put(deleted.transaction);
    if (deleted.extraTransactions?.length) await db.transactions.bulkPut(deleted.extraTransactions);
    if (deleted.movements.length) await db.savingsMovements.bulkPut(deleted.movements);
    if (deleted.debtPayments?.length) await db.debtPayments.bulkPut(deleted.debtPayments);
  });
}
