import { db } from '../db/db';
import type { BillFrequency, ISODate, RecurringBill } from '../db/types';
import { advanceDueDate, isISODate, parseISODate, todayISO } from '../lib/dates';
import { UserFacingError } from './errors';

export interface BillInput {
  name: string;
  amount: number;
  categoryId: number;
  accountId: number;
  frequency: BillFrequency;
  nextDueDate: ISODate;
  active: boolean;
}

async function clean(input: BillInput): Promise<Omit<RecurringBill, 'id'>> {
  const name = input.name.trim();
  if (!name) throw new UserFacingError('Give the bill a name.');
  if (!Number.isSafeInteger(input.amount) || input.amount <= 0) throw new UserFacingError('Enter an amount greater than zero.');
  if (!isISODate(input.nextDueDate)) throw new UserFacingError('Pick the next due date.');
  const category = await db.categories.get(input.categoryId);
  if (!category || category.kind !== 'expense') throw new UserFacingError('Pick an expense category.');
  if (!(await db.accounts.get(input.accountId))) throw new UserFacingError('Pick an account.');
  return {
    ...input,
    name,
    // Remember the day of month so a bill on the 31st comes back to the 31st after short months.
    anchorDay: input.frequency === 'weekly' ? undefined : parseISODate(input.nextDueDate).day,
  };
}

export async function createBill(input: BillInput): Promise<number> {
  return db.recurringBills.add(await clean(input));
}

export async function updateBill(id: number, input: BillInput): Promise<void> {
  const data = await clean(input);
  const existing = await db.recurringBills.get(id);
  // Same due date (e.g. Feb 28 reached from the 31st): keep the original anchor rather than re-anchoring on the 28th.
  if (existing && existing.nextDueDate === data.nextDueDate && existing.frequency === data.frequency && existing.anchorDay !== undefined) {
    data.anchorDay = existing.anchorDay;
  }
  await db.recurringBills.put({ ...data, id });
}

export async function setBillActive(id: number, active: boolean): Promise<void> {
  await db.recurringBills.update(id, { active });
}

export async function deleteBill(id: number): Promise<RecurringBill | null> {
  const bill = await db.recurringBills.get(id);
  if (!bill) return null;
  await db.recurringBills.delete(id);
  return bill;
}

export async function restoreBill(bill: RecurringBill): Promise<void> {
  await db.recurringBills.put(bill);
}

export interface PaidBill {
  billId: number;
  transactionId: number;
  previousDueDate: ISODate;
}

/**
 * "Mark as paid": records the expense (dated `paidOn`, today by default) and
 * moves the bill's next due date forward one period. Undo with undoBillPaid.
 */
export async function markBillPaid(id: number, paidOn: ISODate = todayISO()): Promise<PaidBill> {
  return db.transaction('rw', [db.recurringBills, db.transactions, db.accounts, db.categories], async () => {
    const bill = await db.recurringBills.get(id);
    if (!bill) throw new UserFacingError('This bill no longer exists.');
    if (!(await db.accounts.get(bill.accountId))) throw new UserFacingError('The bill’s account no longer exists. Edit the bill first.');
    if (!(await db.categories.get(bill.categoryId))) throw new UserFacingError('The bill’s category no longer exists. Edit the bill first.');

    const transactionId = await db.transactions.add({
      type: 'expense',
      amount: bill.amount,
      accountId: bill.accountId,
      toAccountId: null,
      categoryId: bill.categoryId,
      date: paidOn,
      note: bill.name,
      createdAt: Date.now(),
    });
    await db.recurringBills.update(id, { nextDueDate: advanceDueDate(bill.nextDueDate, bill.frequency, bill.anchorDay) });
    return { billId: id, transactionId, previousDueDate: bill.nextDueDate };
  });
}

export async function undoBillPaid(paid: PaidBill): Promise<void> {
  await db.transaction('rw', db.recurringBills, db.transactions, async () => {
    await db.transactions.delete(paid.transactionId);
    await db.recurringBills.update(paid.billId, { nextDueDate: paid.previousDueDate });
  });
}
