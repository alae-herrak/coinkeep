import type { ISODate, RecurringBill } from '../db/types';
import { advanceDueDate, diffDays } from '../lib/dates';

/** Safety cap so a corrupt date can never loop forever (weekly over a year = 53). */
const MAX_OCCURRENCES = 400;

/**
 * Every due date of a bill from its nextDueDate up to and including `until`.
 * Overdue dates (before today) are included: they're still unpaid.
 */
export function occurrencesUntil(bill: Pick<RecurringBill, 'nextDueDate' | 'frequency' | 'anchorDay'>, until: ISODate): ISODate[] {
  const dates: ISODate[] = [];
  let d = bill.nextDueDate;
  while (d <= until && dates.length < MAX_OCCURRENCES) {
    dates.push(d);
    d = advanceDueDate(d, bill.frequency, bill.anchorDay);
  }
  return dates;
}

export interface DueBill {
  bill: RecurringBill;
  dueDate: ISODate;
  /** Negative when overdue. */
  daysUntil: number;
}

/** Active bills whose next due date is within `days` days (or already overdue), soonest first. */
export function billsDueSoon(bills: readonly RecurringBill[], today: ISODate, days = 7): DueBill[] {
  return bills
    .filter((b) => b.active)
    .map((b) => ({ bill: b, dueDate: b.nextDueDate, daysUntil: diffDays(today, b.nextDueDate) }))
    .filter((d) => d.daysUntil <= days)
    .sort((a, b) => a.daysUntil - b.daysUntil || a.bill.name.localeCompare(b.bill.name));
}

export function describeDue(daysUntil: number): string {
  if (daysUntil < -1) return `${-daysUntil} days overdue`;
  if (daysUntil === -1) return '1 day overdue';
  if (daysUntil === 0) return 'due today';
  if (daysUntil === 1) return 'due tomorrow';
  return `due in ${daysUntil} days`;
}
