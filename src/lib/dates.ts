/**
 * Calendar-date helpers working on "YYYY-MM-DD" strings.
 * All arithmetic goes through UTC so daylight-saving shifts never move a date.
 */
import type { BillFrequency, ISODate } from '../db/types';

export interface YMD {
  year: number;
  /** 1–12 */
  month: number;
  day: number;
}

const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isISODate(value: string): boolean {
  const m = ISO_RE.exec(value);
  if (!m) return false;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  return month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth(year, month);
}

export function parseISODate(value: ISODate): YMD {
  const m = ISO_RE.exec(value);
  if (!m) throw new Error(`Invalid date: ${value}`);
  return { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) };
}

export function toISODate({ year, month, day }: YMD): ISODate {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** Today's date in the device's local time zone. */
export function todayISO(now: Date = new Date()): ISODate {
  return toISODate({ year: now.getFullYear(), month: now.getMonth() + 1, day: now.getDate() });
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function fromUTC(d: Date): ISODate {
  return toISODate({ year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() });
}

export function addDays(date: ISODate, days: number): ISODate {
  const { year, month, day } = parseISODate(date);
  return fromUTC(new Date(Date.UTC(year, month - 1, day + days)));
}

/** Whole days from a to b (b − a). */
export function diffDays(a: ISODate, b: ISODate): number {
  const pa = parseISODate(a);
  const pb = parseISODate(b);
  return Math.round((Date.UTC(pb.year, pb.month - 1, pb.day) - Date.UTC(pa.year, pa.month - 1, pa.day)) / 86_400_000);
}

/**
 * Adds months, clamping the day to the target month's length.
 * `preferredDay` (1–31) is used instead of the date's own day when given, so
 * a monthly date anchored on the 31st recovers after a short month.
 */
export function addMonths(date: ISODate, months: number, preferredDay?: number): ISODate {
  const { year, month, day } = parseISODate(date);
  const zeroBased = month - 1 + months;
  const y = year + Math.floor(zeroBased / 12);
  const m = (((zeroBased % 12) + 12) % 12) + 1;
  const wanted = preferredDay ?? day;
  return toISODate({ year: y, month: m, day: Math.min(wanted, daysInMonth(y, m)) });
}

/** "YYYY-MM" key for a date. */
export function monthKey(date: ISODate): string {
  return date.slice(0, 7);
}

export function startOfMonth(date: ISODate): ISODate {
  return `${monthKey(date)}-01`;
}

export function endOfMonth(date: ISODate): ISODate {
  const { year, month } = parseISODate(date);
  return toISODate({ year, month, day: daysInMonth(year, month) });
}

/** Moves a recurring bill's due date forward by one period. */
export function advanceDueDate(date: ISODate, frequency: BillFrequency, anchorDay?: number): ISODate {
  switch (frequency) {
    case 'weekly':
      return addDays(date, 7);
    case 'monthly':
      return addMonths(date, 1, anchorDay);
    case 'yearly':
      // Feb 29 → Feb 28 in non-leap years, and back to the 29th when possible.
      return addMonths(date, 12, anchorDay);
  }
}
