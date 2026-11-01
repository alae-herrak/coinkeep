import { db, setSetting } from '../db/db';
import type { Allocation, ISODate, PaycheckTemplate } from '../db/types';
import { allocatePaycheck, FULL_PERCENT, type AllocationResult } from '../domain/allocation';
import { isISODate } from '../lib/dates';
import { UserFacingError } from './errors';

export interface PaycheckInput {
  amount: number;
  source: string;
  accountId: number;
  categoryId: number;
  date: ISODate;
  allocations: Allocation[];
}

export interface LoggedPaycheck {
  transactionId: number;
  movementIds: number[];
  result: AllocationResult;
}

function validateAllocations(allocations: readonly Allocation[]) {
  for (const a of allocations) {
    if (!Number.isSafeInteger(a.value) || a.value < 0) throw new UserFacingError('Allocation amounts must be positive.');
    if (a.mode === 'percent' && a.value > FULL_PERCENT) throw new UserFacingError('A percentage can’t be over 100%.');
  }
}

/**
 * Records a paycheck: one income transaction plus a savings movement per goal,
 * each linked to the transaction (deleting the paycheck removes them too).
 * All-or-nothing: if anything fails, nothing is written.
 */
export async function logPaycheck(input: PaycheckInput): Promise<LoggedPaycheck> {
  if (!Number.isSafeInteger(input.amount) || input.amount <= 0) throw new UserFacingError('Enter the paycheck amount.');
  if (!isISODate(input.date)) throw new UserFacingError('Pick a valid date.');
  validateAllocations(input.allocations);

  const result = allocatePaycheck(input.amount, input.allocations);
  if (result.remaining < 0) throw new UserFacingError('You’ve allocated more than the paycheck.');

  return db.transaction('rw', [db.transactions, db.savingsMovements, db.savingsGoals, db.accounts, db.categories, db.settings], async () => {
    const account = await db.accounts.get(input.accountId);
    if (!account) throw new UserFacingError('Pick an account.');
    const category = await db.categories.get(input.categoryId);
    if (!category || category.kind !== 'income') throw new UserFacingError('Pick an income category.');

    const source = input.source.trim();
    const transactionId = await db.transactions.add({
      type: 'income',
      amount: input.amount,
      accountId: input.accountId,
      toAccountId: null,
      categoryId: input.categoryId,
      date: input.date,
      note: source,
      createdAt: Date.now(),
    });

    const movementIds: number[] = [];
    for (const line of result.lines) {
      if (line.amount === 0) continue;
      const goal = await db.savingsGoals.get(line.goalId);
      if (!goal || goal.archived) throw new UserFacingError('One of the goals no longer exists. Please review the split.');
      movementIds.push(
        await db.savingsMovements.add({
          goalId: line.goalId,
          amount: line.amount,
          date: input.date,
          note: source ? `From paycheck: ${source}` : 'From paycheck',
          linkedTransactionId: transactionId,
        }),
      );
    }

    await setSetting('lastUsedAccountId', input.accountId);
    return { transactionId, movementIds, result };
  });
}

export type TemplateInput = Omit<PaycheckTemplate, 'id'>;

export async function saveTemplate(input: TemplateInput, id?: number): Promise<number> {
  const source = input.source.trim();
  if (!source) throw new UserFacingError('Give the template a name (e.g. your employer).');
  if (!Number.isSafeInteger(input.defaultAmount) || input.defaultAmount < 0) throw new UserFacingError('Enter a valid amount.');
  validateAllocations(input.allocations);
  // Drop zero lines so templates stay tidy.
  const data = { ...input, source, allocations: input.allocations.filter((a) => a.value > 0) };
  if (id !== undefined) {
    await db.paycheckTemplates.put({ ...data, id });
    return id;
  }
  return db.paycheckTemplates.add(data);
}

export async function deleteTemplate(id: number): Promise<PaycheckTemplate | null> {
  const t = await db.paycheckTemplates.get(id);
  if (!t) return null;
  await db.paycheckTemplates.delete(id);
  return t;
}

export async function restoreTemplate(t: PaycheckTemplate): Promise<void> {
  await db.paycheckTemplates.put(t);
}
