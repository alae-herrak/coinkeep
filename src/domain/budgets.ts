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
