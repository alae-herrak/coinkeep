import type { ISODate, SavingsMovement } from '../db/types';
import { parseISODate } from '../lib/dates';

/** Amount currently held per goal (sum of allocations minus withdrawals). */
export function heldByGoal(movements: readonly Pick<SavingsMovement, 'goalId' | 'amount'>[]): Map<number, number> {
  const held = new Map<number, number>();
  for (const m of movements) held.set(m.goalId, (held.get(m.goalId) ?? 0) + m.amount);
  return held;
}

/** Fraction 0..1 of the target reached (1 when there's no positive target but money is held). */
export function goalProgress(held: number, target: number | null): number {
  if (target === null || target <= 0) return held > 0 ? 1 : 0;
  return Math.max(0, Math.min(1, held / target));
}

/**
 * How many monthly contributions fit between today and the target date,
 * counting today: Nov 15 → May 1 = 6 (Nov 15, Dec 15 … Apr 15),
 * Nov 1 → May 1 = 7 (May 1 itself still counts).
 */
export function contributionsLeft(today: ISODate, targetDate: ISODate): number {
  if (targetDate < today) return 0;
  const a = parseISODate(today);
  const b = parseISODate(targetDate);
  const months = (b.year - a.year) * 12 + (b.month - a.month);
  return months + (b.day >= a.day ? 1 : 0);
}

export type MonthlyNeed =
  | { kind: 'none' } // no target amount or no target date
  | { kind: 'reached' }
  | { kind: 'overdue'; remaining: number }
  | { kind: 'perMonth'; amount: number; months: number };

/** "X DH/month to reach your target date". Rounded up so following it never falls short. */
export function monthlyNeeded(held: number, target: number | null, targetDate: ISODate | null, today: ISODate): MonthlyNeed {
  if (target === null || target <= 0) return { kind: 'none' };
  const remaining = target - held;
  if (remaining <= 0) return { kind: 'reached' };
  if (targetDate === null) return { kind: 'none' };
  const months = contributionsLeft(today, targetDate);
  if (months <= 0) return { kind: 'overdue', remaining };
  return { kind: 'perMonth', amount: Math.ceil(remaining / months), months };
}
