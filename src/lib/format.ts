import type { ISODate } from '../db/types';
import { addDays, parseISODate, todayISO } from './dates';

const LOCALE = 'en-GB';

function toLocalDate(date: ISODate): Date {
  const { year, month, day } = parseISODate(date);
  return new Date(year, month - 1, day, 12);
}

/** "Today", "Yesterday", "Tue 28 Oct", or "Tue 28 Oct 2025" for other years. */
export function formatDayLabel(date: ISODate, today: ISODate = todayISO()): string {
  if (date === today) return 'Today';
  if (date === addDays(today, -1)) return 'Yesterday';
  if (date === addDays(today, 1)) return 'Tomorrow';
  const sameYear = date.slice(0, 4) === today.slice(0, 4);
  return toLocalDate(date).toLocaleDateString(LOCALE, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    ...(sameYear ? {} : { year: 'numeric' }),
  });
}

/** "28 Oct 2026" */
export function formatShortDate(date: ISODate): string {
  return toLocalDate(date).toLocaleDateString(LOCALE, { day: 'numeric', month: 'short', year: 'numeric' });
}

/** "October 2026" from a "YYYY-MM" key or a full date. */
export function formatMonth(monthOrDate: string): string {
  const [y, m] = monthOrDate.split('-').map(Number);
  return new Date(y ?? 2000, (m ?? 1) - 1, 1).toLocaleDateString(LOCALE, { month: 'long', year: 'numeric' });
}

export const ACCOUNT_TYPE_LABELS = {
  cash: 'Cash',
  bank: 'Bank',
  card: 'Card',
  other: 'Other',
} as const;
