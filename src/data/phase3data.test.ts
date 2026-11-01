import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../db/db';
import { createAccount } from './accounts';
import { addMovement, archiveGoal, createGoal, deleteGoal, goalHeld, restoreGoal, undoArchiveGoal } from './goals';
import { logPaycheck, saveTemplate } from './paycheck';
import { deleteTransaction, restoreTransaction } from './transactions';

beforeEach(async () => {
  await db.delete();
  await db.open();
});

const goalInput = (name: string) => ({ name, icon: 'Target', color: '#4f46e5', targetAmount: 1_000_000, targetDate: null });

async function setup() {
  const accountId = await createAccount({ name: 'Bank', type: 'bank', startingBalance: 0 });
  const salary = (await db.categories.filter((c) => c.name === 'Salary').first())!.id;
  const trip = await createGoal(goalInput('Trip'));
  const fund = await createGoal(goalInput('Emergency'));
  return { accountId, salary, trip, fund };
}

describe('logPaycheck', () => {
  it('creates the income and linked movements that add up exactly', async () => {
    const { accountId, salary, trip, fund } = await setup();
    const logged = await logPaycheck({
      amount: 1_000_001,
      source: ' ACME ',
      accountId,
      categoryId: salary,
      date: '2026-11-25',
      allocations: [
        { goalId: trip, mode: 'percent', value: 3333 },
        { goalId: fund, mode: 'fixed', value: 50_000 },
      ],
    });
    const tx = await db.transactions.get(logged.transactionId);
    expect(tx).toMatchObject({ type: 'income', amount: 1_000_001, note: 'ACME' });
    const movements = await db.savingsMovements.where('linkedTransactionId').equals(logged.transactionId).toArray();
    expect(movements.map((m) => m.amount).sort()).toEqual([333_300, 50_000].sort());
    expect(logged.result.allocated + logged.result.remaining).toBe(1_000_001);
    expect(await goalHeld(trip)).toBe(333_300);
  });

  it('writes nothing when over-allocated or a goal is archived', async () => {
    const { accountId, salary, trip, fund } = await setup();
    await expect(
      logPaycheck({ amount: 1000, source: '', accountId, categoryId: salary, date: '2026-11-25', allocations: [{ goalId: trip, mode: 'fixed', value: 2000 }] }),
    ).rejects.toThrow('more than the paycheck');

    await archiveGoal(fund);
    await expect(
      logPaycheck({ amount: 1000, source: '', accountId, categoryId: salary, date: '2026-11-25', allocations: [{ goalId: fund, mode: 'fixed', value: 10 }] }),
    ).rejects.toThrow('no longer exists');
    expect(await db.transactions.count()).toBe(0);
    expect(await db.savingsMovements.count()).toBe(0);
  });

  it('skips zero allocations and is undone by deleting the transaction', async () => {
    const { accountId, salary, trip, fund } = await setup();
    const logged = await logPaycheck({
      amount: 500_000,
      source: 'ACME',
      accountId,
      categoryId: salary,
      date: '2026-11-25',
      allocations: [
        { goalId: trip, mode: 'fixed', value: 0 },
        { goalId: fund, mode: 'percent', value: 1000 },
      ],
    });
    expect(logged.movementIds).toHaveLength(1);
    const deleted = await deleteTransaction(logged.transactionId);
    expect(await goalHeld(fund)).toBe(0);
    await restoreTransaction(deleted!);
    expect(await goalHeld(fund)).toBe(50_000);
  });
});

describe('goal movements', () => {
  it('refuses withdrawals larger than the held amount', async () => {
    const { trip } = await setup();
    await addMovement(trip, { amount: 10_000, date: '2026-11-01', note: '' });
    await expect(addMovement(trip, { amount: -10_001, date: '2026-11-02', note: '' })).rejects.toThrow('more than the goal holds');
    await addMovement(trip, { amount: -10_000, date: '2026-11-02', note: '' });
    expect(await goalHeld(trip)).toBe(0);
    await expect(addMovement(trip, { amount: 0, date: '2026-11-02', note: '' })).rejects.toThrow();
  });

  it('releases held money when archiving, and undo puts it back', async () => {
    const { trip } = await setup();
    await addMovement(trip, { amount: 25_000, date: '2026-11-01', note: '' });
    const archived = await archiveGoal(trip);
    expect(await goalHeld(trip)).toBe(0);
    expect((await db.savingsGoals.get(trip))!.archived).toBe(true);
    await undoArchiveGoal(archived);
    expect(await goalHeld(trip)).toBe(25_000);
    expect((await db.savingsGoals.get(trip))!.archived).toBe(false);
  });

  it('deletes a goal with history and template references, and restores them', async () => {
    const { accountId, trip, fund } = await setup();
    await addMovement(trip, { amount: 5_000, date: '2026-11-01', note: '' });
    const templateId = await saveTemplate({
      source: 'ACME',
      defaultAmount: 900_000,
      accountId,
      allocations: [
        { goalId: trip, mode: 'percent', value: 1000 },
        { goalId: fund, mode: 'fixed', value: 0 }, // zero lines are dropped on save
      ],
    });
    expect((await db.paycheckTemplates.get(templateId))!.allocations).toHaveLength(1);

    const deleted = await deleteGoal(trip);
    expect(await db.savingsGoals.get(trip)).toBeUndefined();
    expect(await db.savingsMovements.count()).toBe(0);
    expect((await db.paycheckTemplates.get(templateId))!.allocations).toEqual([]);

    await restoreGoal(deleted!);
    expect(await goalHeld(trip)).toBe(5_000);
    expect((await db.paycheckTemplates.get(templateId))!.allocations).toEqual([{ goalId: trip, mode: 'percent', value: 1000 }]);
  });
});
