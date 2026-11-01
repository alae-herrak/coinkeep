import type { Allocation } from '../db/types';

/** 100% in basis points. Percent allocations are stored as basis points (2500 = 25%). */
export const FULL_PERCENT = 10_000;

export interface AllocationLine {
  goalId: number;
  amount: number;
}

export interface AllocationResult {
  lines: AllocationLine[];
  allocated: number;
  /** Paycheck amount left unallocated (stays spendable). Negative = over-allocated. */
  remaining: number;
}

/**
 * Splits a paycheck between savings goals.
 *
 * - Fixed allocations take their exact centime amount.
 * - Percent allocations are a share of the whole paycheck. Their combined total
 *   is rounded once, then handed out with the largest-remainder method, so the
 *   pieces always add up exactly: allocated + remaining === amount, and a 100%
 *   split leaves exactly 0 — never a lost or invented centime.
 *
 * Lines keep the input order; goals listed twice are merged.
 */
export function allocatePaycheck(amount: number, allocations: readonly Allocation[]): AllocationResult {
  if (!Number.isSafeInteger(amount) || amount < 0) throw new Error(`Invalid paycheck amount: ${amount}`);

  const order: number[] = [];
  const totals = new Map<number, number>();
  const add = (goalId: number, value: number) => {
    if (!totals.has(goalId)) {
      order.push(goalId);
      totals.set(goalId, 0);
    }
    totals.set(goalId, totals.get(goalId)! + value);
  };

  const percent: { goalId: number; floor: number; remainder: number; index: number }[] = [];
  let totalBasisPoints = 0;

  allocations.forEach((a, index) => {
    const value = Math.max(0, Math.round(a.value));
    if (a.mode === 'fixed') {
      add(a.goalId, value);
      return;
    }
    // amount ≤ ~9e13 centimes keeps amount × 10 000 inside safe integers.
    const exact = amount * value;
    percent.push({ goalId: a.goalId, floor: Math.floor(exact / FULL_PERCENT), remainder: exact % FULL_PERCENT, index });
    totalBasisPoints += value;
    add(a.goalId, 0);
  });

  if (percent.length > 0) {
    // Round the combined percent share half-up, then distribute the leftover
    // centimes to the largest fractional remainders (earlier lines win ties).
    const target = Math.floor((amount * totalBasisPoints + FULL_PERCENT / 2) / FULL_PERCENT);
    let leftover = target - percent.reduce((s, p) => s + p.floor, 0);
    const byRemainder = [...percent].sort((a, b) => b.remainder - a.remainder || a.index - b.index);
    for (const p of byRemainder) {
      if (leftover <= 0) break;
      p.floor += 1;
      leftover -= 1;
    }
    for (const p of percent) add(p.goalId, p.floor);
  }

  const lines = order.map((goalId) => ({ goalId, amount: totals.get(goalId)! }));
  const allocated = lines.reduce((s, l) => s + l.amount, 0);
  return { lines, allocated, remaining: amount - allocated };
}
