import type { ISODate, RecurringBill } from '../db/types';
import { endOfMonth } from '../lib/dates';
import { occurrencesUntil } from './bills';

export interface UpcomingBill {
  bill: RecurringBill;
  /** Unpaid due dates up to the end of the month (a weekly bill can have several). */
  dueDates: ISODate[];
  total: number;
}

export interface SafeToSpend {
  /** Sum of all account balances. */
  accountsTotal: number;
  /** Money set aside in savings goals. */
  savingsHeld: number;
  /** Unpaid active bills due on or before the end of this month (overdue ones included). */
  upcomingBills: UpcomingBill[];
  billsTotal: number;
  /** accountsTotal − savingsHeld − billsTotal. Can be negative. */
  amount: number;
  /** Last day counted for bills. */
  through: ISODate;
}

/**
 * "Safe to spend" = all account balances − money held in savings goals −
 * active bills due before the end of the current month that aren't paid yet.
 *
 * A bill counts as paid once "Mark as paid" has advanced its nextDueDate past
 * the date, so every due date from nextDueDate up to month-end is still owed.
 */
export function computeSafeToSpend(input: {
  accountsTotal: number;
  savingsHeld: number;
  bills: readonly RecurringBill[];
  today: ISODate;
}): SafeToSpend {
  const through = endOfMonth(input.today);
  const upcomingBills: UpcomingBill[] = [];
  for (const bill of input.bills) {
    if (!bill.active) continue;
    const dueDates = occurrencesUntil(bill, through);
    if (dueDates.length === 0) continue;
    upcomingBills.push({ bill, dueDates, total: bill.amount * dueDates.length });
  }
  upcomingBills.sort((a, b) => (a.dueDates[0]! < b.dueDates[0]! ? -1 : a.dueDates[0]! > b.dueDates[0]! ? 1 : 0));
  const billsTotal = upcomingBills.reduce((sum, b) => sum + b.total, 0);
  return {
    accountsTotal: input.accountsTotal,
    savingsHeld: input.savingsHeld,
    upcomingBills,
    billsTotal,
    amount: input.accountsTotal - input.savingsHeld - billsTotal,
    through,
  };
}
