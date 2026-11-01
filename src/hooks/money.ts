/** Reactive hooks for goals, "Safe to spend" and month summaries. */
import { useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import type { Category, RecurringBill, SavingsGoal } from '../db/types';
import { computeAccountBalances, sumBalances } from '../domain/balances';
import { budgetProgress, type BudgetProgress } from '../domain/budgets';
import { heldByGoal } from '../domain/goals';
import { computeSafeToSpend, type SafeToSpend } from '../domain/safeToSpend';
import { endOfMonth, startOfMonth, todayISO } from '../lib/dates';

export interface GoalWithHeld extends SavingsGoal {
  held: number;
}

export interface GoalsData {
  active: GoalWithHeld[];
  archived: GoalWithHeld[];
  byId: Map<number, GoalWithHeld>;
  /** Money set aside across all goals. */
  totalHeld: number;
}

export function useGoals(): GoalsData | undefined {
  const raw = useLiveQuery(async () => {
    const [goals, movements] = await Promise.all([db.savingsGoals.toArray(), db.savingsMovements.toArray()]);
    return { goals, held: heldByGoal(movements) };
  });
  return useMemo(() => {
    if (!raw) return undefined;
    const all = raw.goals.map((g) => ({ ...g, held: raw.held.get(g.id) ?? 0 })).sort((a, b) => a.id - b.id);
    return {
      active: all.filter((g) => !g.archived),
      archived: all.filter((g) => g.archived),
      byId: new Map(all.map((g) => [g.id, g])),
      totalHeld: all.reduce((s, g) => s + g.held, 0),
    };
  }, [raw]);
}

/** Live "Safe to spend" with its full breakdown. */
export function useSafeToSpend(): SafeToSpend | undefined {
  return useLiveQuery(async () => {
    const [accounts, transactions, movements, bills] = await Promise.all([
      db.accounts.toArray(),
      db.transactions.toArray(),
      db.savingsMovements.toArray(),
      db.recurringBills.toArray(),
    ]);
    const savingsHeld = movements.reduce((s, m) => s + m.amount, 0);
    return computeSafeToSpend({
      accountsTotal: sumBalances(computeAccountBalances(accounts, transactions)),
      savingsHeld,
      bills,
      today: todayISO(),
    });
  });
}

export interface MonthSummary {
  income: number;
  spent: number;
  /** Net added to goals this month (allocations − withdrawals). */
  saved: number;
  /** Expense totals per category id. */
  spentByCategory: Map<number, number>;
}

/** Totals for the month containing `date` (default: this month). */
export function useMonthSummary(date: string = todayISO()): MonthSummary | undefined {
  const from = startOfMonth(date);
  const to = endOfMonth(date);
  return useLiveQuery(async () => {
    const [txs, movements] = await Promise.all([
      db.transactions.where('date').between(from, to, true, true).toArray(),
      db.savingsMovements.where('date').between(from, to, true, true).toArray(),
    ]);
    const summary: MonthSummary = { income: 0, spent: 0, saved: 0, spentByCategory: new Map() };
    for (const t of txs) {
      if (t.type === 'income') summary.income += t.amount;
      if (t.type === 'expense') {
        summary.spent += t.amount;
        if (t.categoryId !== null) summary.spentByCategory.set(t.categoryId, (summary.spentByCategory.get(t.categoryId) ?? 0) + t.amount);
      }
    }
    summary.saved = movements.reduce((s, m) => s + m.amount, 0);
    return summary;
  }, [from, to]);
}

export interface CategoryBudget {
  category: Category;
  progress: BudgetProgress;
}

/** Expense categories with a budget, most used (by share) first. */
export function categoryBudgets(categories: readonly Category[], spentByCategory: Map<number, number>): CategoryBudget[] {
  return categories
    .filter((c) => c.kind === 'expense' && !c.archived && c.monthlyBudget !== null)
    .map((c) => ({ category: c, progress: budgetProgress(spentByCategory.get(c.id) ?? 0, c.monthlyBudget ?? 0) }))
    .sort((a, b) => b.progress.ratio - a.progress.ratio || a.category.sortOrder - b.category.sortOrder);
}

export function useBills(): RecurringBill[] | undefined {
  return useLiveQuery(() => db.recurringBills.toArray());
}
