import type { ISODate } from '../db/types';
import { daysInMonth, parseISODate } from '../lib/dates';

export type BudgetStatus = 'ok' | 'warning' | 'over';

/** Share of the budget at which the bar turns amber. */
export const BUDGET_WARNING_RATIO = 0.8;

export interface BudgetProgress {
  spent: number;
  budget: number;
  /** spent / budget, not clamped (1.25 = 25% over). 0 when the budget is 0 and nothing is spent. */
  ratio: number;
  /** budget − spent; negative when over. */
  remaining: number;
  status: BudgetStatus;
}

/** green below 80%, amber from 80% up to the budget, red once spending exceeds it. */
export function budgetProgress(spent: number, budget: number): BudgetProgress {
  const ratio = budget > 0 ? spent / budget : spent > 0 ? Infinity : 0;
  const status: BudgetStatus = spent > budget ? 'over' : ratio >= BUDGET_WARNING_RATIO ? 'warning' : 'ok';
  return { spent, budget, ratio, remaining: budget - spent, status };
}

export interface MonthPace {
  /** Share of the month that has passed by the end of today, 0..1. */
  elapsed: number;
  /** Days left in the month, today included. */
  daysLeft: number;
}

/** Where today sits in its month: drives the "today" tick on budget bars and the per-day allowance. */
export function monthPace(today: ISODate): MonthPace {
  const { year, month, day } = parseISODate(today);
  const total = daysInMonth(year, month);
  return { elapsed: day / total, daysLeft: total - day + 1 };
}

/** What can still be spent per day without going over (0 once over). */
export function perDayLeft(progress: BudgetProgress, pace: MonthPace): number {
  return Math.max(0, Math.floor(progress.remaining / pace.daysLeft));
}

/** Spent a bigger share of the budget than of the month (with a little slack so day one isn't flagged). */
export function isAheadOfPace(progress: BudgetProgress, pace: MonthPace, slack = 0.05): boolean {
  return progress.ratio > pace.elapsed + slack;
}
