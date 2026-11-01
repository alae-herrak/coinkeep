import { describe, expect, it } from 'vitest';
import {
  addDays,
  addMonths,
  advanceDueDate,
  daysInMonth,
  diffDays,
  endOfMonth,
  isISODate,
  startOfMonth,
  todayISO,
} from './dates';

describe('date helpers', () => {
  it('validates ISO dates', () => {
    expect(isISODate('2026-02-28')).toBe(true);
    expect(isISODate('2026-02-29')).toBe(false);
    expect(isISODate('2028-02-29')).toBe(true);
    expect(isISODate('2026-13-01')).toBe(false);
    expect(isISODate('2026-1-01')).toBe(false);
  });

  it('knows month lengths', () => {
    expect(daysInMonth(2026, 1)).toBe(31);
    expect(daysInMonth(2026, 2)).toBe(28);
    expect(daysInMonth(2028, 2)).toBe(29);
    expect(daysInMonth(2100, 2)).toBe(28);
    expect(daysInMonth(2000, 2)).toBe(29);
    expect(daysInMonth(2026, 4)).toBe(30);
  });

  it('formats today in local time', () => {
    expect(todayISO(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05');
  });

  it('adds days across month/year boundaries', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(addDays('2026-03-28', 7)).toBe('2026-04-04'); // spans a DST change in many zones
  });

  it('diffs days', () => {
    expect(diffDays('2026-01-01', '2026-01-08')).toBe(7);
    expect(diffDays('2026-03-25', '2026-04-01')).toBe(7);
    expect(diffDays('2026-01-08', '2026-01-01')).toBe(-7);
  });

  it('computes month bounds', () => {
    expect(startOfMonth('2026-02-14')).toBe('2026-02-01');
    expect(endOfMonth('2026-02-14')).toBe('2026-02-28');
    expect(endOfMonth('2028-02-01')).toBe('2028-02-29');
    expect(endOfMonth('2026-12-05')).toBe('2026-12-31');
  });

  it('adds months with clamping', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonths('2026-12-15', 1)).toBe('2027-01-15');
    expect(addMonths('2026-01-15', -1)).toBe('2025-12-15');
    expect(addMonths('2026-03-31', -13)).toBe('2025-02-28');
    expect(addMonths('2026-02-28', 1, 31)).toBe('2026-03-31');
  });
});

describe('advanceDueDate', () => {
  it('advances weekly bills by 7 days', () => {
    expect(advanceDueDate('2026-12-29', 'weekly')).toBe('2027-01-05');
  });

  it('clamps monthly bills on the 31st to short months', () => {
    expect(advanceDueDate('2026-01-31', 'monthly')).toBe('2026-02-28');
    expect(advanceDueDate('2028-01-31', 'monthly')).toBe('2028-02-29');
    expect(advanceDueDate('2026-03-31', 'monthly')).toBe('2026-04-30');
  });

  it('returns to the anchor day after a short month', () => {
    let d = '2026-01-31';
    const seen: string[] = [];
    for (let i = 0; i < 4; i++) {
      d = advanceDueDate(d, 'monthly', 31);
      seen.push(d);
    }
    expect(seen).toEqual(['2026-02-28', '2026-03-31', '2026-04-30', '2026-05-31']);
  });

  it('drifts without an anchor (documents why anchorDay exists)', () => {
    expect(advanceDueDate(advanceDueDate('2026-01-31', 'monthly'), 'monthly')).toBe('2026-03-28');
  });

  it('handles yearly bills on Feb 29', () => {
    expect(advanceDueDate('2028-02-29', 'yearly')).toBe('2029-02-28');
    expect(advanceDueDate('2031-02-28', 'yearly', 29)).toBe('2032-02-29');
    expect(advanceDueDate('2026-12-31', 'yearly')).toBe('2027-12-31');
  });
});
