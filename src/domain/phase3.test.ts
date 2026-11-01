import { describe, expect, it } from 'vitest';
import type { Allocation, RecurringBill } from '../db/types';
import { allocatePaycheck, FULL_PERCENT } from './allocation';
import { billsDueSoon, describeDue, occurrencesUntil } from './bills';
import { budgetProgress } from './budgets';
import { contributionsLeft, goalProgress, heldByGoal, monthlyNeeded } from './goals';
import { computeSafeToSpend } from './safeToSpend';

let billId = 1;
function bill(partial: Partial<RecurringBill>): RecurringBill {
  return {
    id: billId++,
    name: 'Bill',
    amount: 10000,
    categoryId: 1,
    accountId: 1,
    frequency: 'monthly',
    nextDueDate: '2026-11-20',
    active: true,
    ...partial,
  };
}

describe('computeSafeToSpend', () => {
  const today = '2026-11-10';

  it('subtracts savings and unpaid bills due by the end of the month', () => {
    const result = computeSafeToSpend({
      accountsTotal: 1_000_000,
      savingsHeld: 200_000,
      bills: [
        bill({ name: 'Rent', amount: 300_000, nextDueDate: '2026-11-30' }),
        bill({ name: 'Internet', amount: 25_000, nextDueDate: '2026-12-01' }), // next month: not counted
      ],
      today,
    });
    expect(result.through).toBe('2026-11-30');
    expect(result.upcomingBills.map((b) => b.bill.name)).toEqual(['Rent']);
    expect(result.billsTotal).toBe(300_000);
    expect(result.amount).toBe(1_000_000 - 200_000 - 300_000);
  });

  it('includes overdue bills and every weekly occurrence left this month', () => {
    const result = computeSafeToSpend({
      accountsTotal: 500_000,
      savingsHeld: 0,
      bills: [
        bill({ name: 'Gym', amount: 5_000, frequency: 'weekly', nextDueDate: '2026-11-03' }), // 3, 10, 17, 24
        bill({ name: 'Phone', amount: 9_900, nextDueDate: '2026-10-28' }), // overdue from last month
      ],
      today,
    });
    const gym = result.upcomingBills.find((b) => b.bill.name === 'Gym')!;
    expect(gym.dueDates).toEqual(['2026-11-03', '2026-11-10', '2026-11-17', '2026-11-24']);
    expect(gym.total).toBe(20_000);
    const phone = result.upcomingBills[0]!;
    expect(phone.bill.name).toBe('Phone'); // soonest first
    // October's payment is still unpaid, and November's falls due on the 28th: both are owed.
    expect(phone.dueDates).toEqual(['2026-10-28', '2026-11-28']);
    expect(result.billsTotal).toBe(20_000 + 2 * 9_900);
    expect(result.amount).toBe(500_000 - 39_800);
  });

  it('ignores inactive bills and can go negative', () => {
    const result = computeSafeToSpend({
      accountsTotal: 10_000,
      savingsHeld: 5_000,
      bills: [bill({ amount: 50_000 }), bill({ amount: 99_999, active: false })],
      today,
    });
    expect(result.billsTotal).toBe(50_000);
    expect(result.amount).toBe(-45_000);
  });

  it('works on the last day of the month', () => {
    const result = computeSafeToSpend({
      accountsTotal: 100,
      savingsHeld: 0,
      bills: [bill({ nextDueDate: '2027-02-28', amount: 40 }), bill({ nextDueDate: '2027-03-01', amount: 99 })],
      today: '2027-02-28',
    });
    expect(result.billsTotal).toBe(40);
  });
});

describe('bills helpers', () => {
  it('lists occurrences with month-end anchoring', () => {
    expect(occurrencesUntil(bill({ nextDueDate: '2026-01-31', anchorDay: 31 }), '2026-04-30')).toEqual([
      '2026-01-31',
      '2026-02-28',
      '2026-03-31',
      '2026-04-30',
    ]);
    expect(occurrencesUntil(bill({ nextDueDate: '2026-05-01' }), '2026-04-30')).toEqual([]);
  });

  it('finds bills due within 7 days, overdue first', () => {
    const due = billsDueSoon(
      [
        bill({ name: 'Later', nextDueDate: '2026-11-25' }),
        bill({ name: 'Soon', nextDueDate: '2026-11-17' }),
        bill({ name: 'Late', nextDueDate: '2026-11-08' }),
        bill({ name: 'Paused', nextDueDate: '2026-11-11', active: false }),
      ],
      '2026-11-10',
    );
    expect(due.map((d) => [d.bill.name, d.daysUntil])).toEqual([
      ['Late', -2],
      ['Soon', 7],
    ]);
  });

  it('describes due dates', () => {
    expect(describeDue(-3)).toBe('3 days overdue');
    expect(describeDue(-1)).toBe('1 day overdue');
    expect(describeDue(0)).toBe('due today');
    expect(describeDue(1)).toBe('due tomorrow');
    expect(describeDue(5)).toBe('due in 5 days');
  });
});

describe('budgetProgress', () => {
  it('goes green → amber at 80% → red when over', () => {
    expect(budgetProgress(0, 100_000).status).toBe('ok');
    expect(budgetProgress(79_999, 100_000).status).toBe('ok');
    expect(budgetProgress(80_000, 100_000).status).toBe('warning');
    expect(budgetProgress(100_000, 100_000).status).toBe('warning'); // exactly on budget isn't over
    expect(budgetProgress(100_001, 100_000).status).toBe('over');
  });

  it('reports remaining and ratio', () => {
    expect(budgetProgress(125_000, 100_000)).toMatchObject({ ratio: 1.25, remaining: -25_000 });
    expect(budgetProgress(0, 0)).toMatchObject({ ratio: 0, status: 'ok' });
    expect(budgetProgress(1, 0)).toMatchObject({ status: 'over' });
  });
});

describe('goals', () => {
  it('sums movements per goal', () => {
    const held = heldByGoal([
      { goalId: 1, amount: 10_000 },
      { goalId: 1, amount: -2_500 },
      { goalId: 2, amount: 300 },
    ]);
    expect(held.get(1)).toBe(7_500);
    expect(held.get(2)).toBe(300);
  });

  it('computes progress', () => {
    expect(goalProgress(5_000, 10_000)).toBe(0.5);
    expect(goalProgress(15_000, 10_000)).toBe(1);
    expect(goalProgress(-5, 10_000)).toBe(0);
    expect(goalProgress(100, null)).toBe(1);
    expect(goalProgress(0, null)).toBe(0);
  });

  it('counts monthly contributions left', () => {
    expect(contributionsLeft('2026-11-15', '2027-05-01')).toBe(6);
    expect(contributionsLeft('2026-11-01', '2027-05-01')).toBe(7);
    expect(contributionsLeft('2026-11-15', '2026-11-30')).toBe(1);
    expect(contributionsLeft('2026-11-15', '2026-11-15')).toBe(1);
    expect(contributionsLeft('2026-01-31', '2026-02-28')).toBe(1);
    expect(contributionsLeft('2026-11-15', '2026-11-14')).toBe(0);
  });

  it('computes the monthly amount needed, rounded up', () => {
    expect(monthlyNeeded(0, 1_000_000, '2027-04-15', '2026-11-15')).toEqual({ kind: 'perMonth', amount: 166_667, months: 6 });
    expect(monthlyNeeded(1_000_000, 1_000_000, '2027-04-15', '2026-11-15')).toEqual({ kind: 'reached' });
    expect(monthlyNeeded(0, 1_000_000, null, '2026-11-15')).toEqual({ kind: 'none' });
    expect(monthlyNeeded(0, null, '2027-01-01', '2026-11-15')).toEqual({ kind: 'none' });
    expect(monthlyNeeded(400, 1_000, '2026-11-01', '2026-11-15')).toEqual({ kind: 'overdue', remaining: 600 });
  });
});

describe('allocatePaycheck', () => {
  const pct = (goalId: number, percent: number): Allocation => ({ goalId, mode: 'percent', value: Math.round(percent * 100) });
  const fixed = (goalId: number, amount: number): Allocation => ({ goalId, mode: 'fixed', value: amount });

  it('handles fixed and percent allocations', () => {
    const r = allocatePaycheck(900_000, [fixed(1, 50_000), pct(2, 10)]);
    expect(r.lines).toEqual([
      { goalId: 1, amount: 50_000 },
      { goalId: 2, amount: 90_000 },
    ]);
    expect(r.allocated).toBe(140_000);
    expect(r.remaining).toBe(760_000);
  });

  it('splits 100% into thirds without losing a centime', () => {
    const r = allocatePaycheck(100, [pct(1, 33.33), pct(2, 33.33), pct(3, 33.34)]);
    expect(r.lines.map((l) => l.amount)).toEqual([33, 33, 34]);
    expect(r.remaining).toBe(0);

    const even = allocatePaycheck(100_001, [
      { goalId: 1, mode: 'percent', value: FULL_PERCENT / 2 },
      { goalId: 2, mode: 'percent', value: FULL_PERCENT / 2 },
    ]);
    expect(even.lines.map((l) => l.amount)).toEqual([50_001, 50_000]);
    expect(even.remaining).toBe(0);
  });

  it('rounds the combined percent share half-up', () => {
    // 3 × 12.5% of 1,01 DH = 37.875 centimes → 38, spread by largest remainder.
    const r = allocatePaycheck(101, [pct(1, 12.5), pct(2, 12.5), pct(3, 12.5)]);
    expect(r.allocated).toBe(38);
    expect(r.lines.map((l) => l.amount)).toEqual([13, 13, 12]);
    expect(r.remaining).toBe(63);
  });

  it('reports over-allocation as negative remaining', () => {
    const r = allocatePaycheck(10_000, [fixed(1, 8_000), pct(2, 50)]);
    expect(r.remaining).toBe(-3_000);
  });

  it('merges duplicate goals and ignores negative values', () => {
    const r = allocatePaycheck(10_000, [fixed(1, 1_000), pct(1, 10), fixed(2, -500)]);
    expect(r.lines).toEqual([
      { goalId: 1, amount: 2_000 },
      { goalId: 2, amount: 0 },
    ]);
  });

  it('never creates or loses a centime (randomised)', () => {
    let seed = 42;
    const rand = (n: number) => {
      seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_648;
      return seed % n;
    };
    for (let i = 0; i < 2_000; i++) {
      const amount = rand(5_000_000);
      const n = 1 + rand(5);
      const allocations: Allocation[] = [];
      for (let g = 0; g < n; g++) {
        allocations.push(rand(3) === 0 ? fixed(g, rand(amount / 4 + 1)) : { goalId: g, mode: 'percent', value: rand(3_000) });
      }
      const r = allocatePaycheck(amount, allocations);
      expect(r.lines.every((l) => Number.isInteger(l.amount) && l.amount >= 0)).toBe(true);
      expect(r.allocated + r.remaining).toBe(amount);
      expect(r.lines.reduce((s, l) => s + l.amount, 0)).toBe(r.allocated);
      // Each percent line is within one centime of its exact share.
      allocations.forEach((a) => {
        if (a.mode !== 'percent' || allocations.filter((x) => x.goalId === a.goalId).length > 1) return;
        const line = r.lines.find((l) => l.goalId === a.goalId)!;
        expect(Math.abs(line.amount - (amount * a.value) / FULL_PERCENT)).toBeLessThan(1 + 1e-9);
      });
    }
  });

  it('a full 100% split always allocates exactly the paycheck', () => {
    for (const amount of [0, 1, 7, 99, 100, 12_345, 999_999, 1_234_567]) {
      const r = allocatePaycheck(amount, [pct(1, 33.33), pct(2, 33.33), pct(3, 33.33), pct(4, 0.01)]);
      expect(r.allocated).toBe(amount);
    }
  });
});
