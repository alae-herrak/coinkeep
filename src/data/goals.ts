import { db } from '../db/db';
import type { Allocation, ISODate, SavingsGoal, SavingsMovement } from '../db/types';
import { heldByGoal } from '../domain/goals';
import { isISODate, todayISO } from '../lib/dates';
import { UserFacingError } from './errors';

export type GoalInput = Pick<SavingsGoal, 'name' | 'icon' | 'color' | 'targetAmount' | 'targetDate'>;

function clean(input: GoalInput): GoalInput {
  const name = input.name.trim();
  if (!name) throw new UserFacingError('Give your goal a name.');
  if (input.targetAmount !== null && (!Number.isSafeInteger(input.targetAmount) || input.targetAmount <= 0)) {
    throw new UserFacingError('The target must be more than zero.');
  }
  if (input.targetDate !== null && !isISODate(input.targetDate)) throw new UserFacingError('Pick a valid target date.');
  return { ...input, name };
}

export async function createGoal(input: GoalInput): Promise<number> {
  return db.savingsGoals.add({ ...clean(input), archived: false });
}

export async function updateGoal(id: number, input: GoalInput): Promise<void> {
  await db.savingsGoals.update(id, clean(input));
}

export async function goalHeld(goalId: number): Promise<number> {
  const movements = await db.savingsMovements.where('goalId').equals(goalId).toArray();
  return heldByGoal(movements).get(goalId) ?? 0;
}

/**
 * Adds money to a goal (positive amount) or takes it out (negative).
 * Withdrawals can't take a goal below zero.
 */
export async function addMovement(goalId: number, input: { amount: number; date: ISODate; note: string }): Promise<number> {
  if (!Number.isSafeInteger(input.amount) || input.amount === 0) throw new UserFacingError('Enter an amount greater than zero.');
  if (!isISODate(input.date)) throw new UserFacingError('Pick a valid date.');
  return db.transaction('rw', db.savingsGoals, db.savingsMovements, async () => {
    const goal = await db.savingsGoals.get(goalId);
    if (!goal) throw new UserFacingError('This goal no longer exists.');
    if (input.amount < 0) {
      const held = await goalHeld(goalId);
      if (-input.amount > held) throw new UserFacingError('You can’t withdraw more than the goal holds.');
    }
    return db.savingsMovements.add({ goalId, amount: input.amount, date: input.date, note: input.note.trim(), linkedTransactionId: null });
  });
}

export async function deleteMovement(id: number): Promise<SavingsMovement | null> {
  return db.transaction('rw', db.savingsMovements, async () => {
    const movement = await db.savingsMovements.get(id);
    if (!movement) return null;
    await db.savingsMovements.delete(id);
    return movement;
  });
}

export async function restoreMovement(movement: SavingsMovement): Promise<void> {
  await db.savingsMovements.put(movement);
}

export interface ArchivedGoal {
  goalId: number;
  /** Withdrawal created to release the held money, if any. */
  releaseMovementId: number | null;
}

/**
 * Archives a goal. Any money it still holds is released back into
 * "Safe to spend" with a withdrawal, so nothing stays locked in a hidden goal.
 */
export async function archiveGoal(goalId: number): Promise<ArchivedGoal> {
  return db.transaction('rw', db.savingsGoals, db.savingsMovements, async () => {
    const held = await goalHeld(goalId);
    let releaseMovementId: number | null = null;
    if (held > 0) {
      releaseMovementId = await db.savingsMovements.add({
        goalId,
        amount: -held,
        date: todayISO(),
        note: 'Released when archived',
        linkedTransactionId: null,
      });
    }
    await db.savingsGoals.update(goalId, { archived: true });
    return { goalId, releaseMovementId };
  });
}

export async function undoArchiveGoal(archived: ArchivedGoal): Promise<void> {
  await db.transaction('rw', db.savingsGoals, db.savingsMovements, async () => {
    if (archived.releaseMovementId !== null) await db.savingsMovements.delete(archived.releaseMovementId);
    await db.savingsGoals.update(archived.goalId, { archived: false });
  });
}

export async function unarchiveGoal(goalId: number): Promise<void> {
  await db.savingsGoals.update(goalId, { archived: false });
}

export interface DeletedGoal {
  goal: SavingsGoal;
  movements: SavingsMovement[];
  /** Paycheck templates that allocated to this goal, as they were before. */
  templates: { id: number; allocations: Allocation[] }[];
}

/** Deletes a goal with its history (money it held becomes spendable again). Undo with restoreGoal. */
export async function deleteGoal(goalId: number): Promise<DeletedGoal | null> {
  return db.transaction('rw', [db.savingsGoals, db.savingsMovements, db.paycheckTemplates], async () => {
    const goal = await db.savingsGoals.get(goalId);
    if (!goal) return null;
    const movements = await db.savingsMovements.where('goalId').equals(goalId).toArray();
    const templates: DeletedGoal['templates'] = [];
    for (const t of await db.paycheckTemplates.toArray()) {
      if (t.allocations.some((a) => a.goalId === goalId)) {
        templates.push({ id: t.id, allocations: t.allocations });
        await db.paycheckTemplates.update(t.id, { allocations: t.allocations.filter((a) => a.goalId !== goalId) });
      }
    }
    await db.savingsMovements.bulkDelete(movements.map((m) => m.id));
    await db.savingsGoals.delete(goalId);
    return { goal, movements, templates };
  });
}

export async function restoreGoal(deleted: DeletedGoal): Promise<void> {
  await db.transaction('rw', [db.savingsGoals, db.savingsMovements, db.paycheckTemplates], async () => {
    await db.savingsGoals.put(deleted.goal);
    if (deleted.movements.length) await db.savingsMovements.bulkPut(deleted.movements);
    for (const t of deleted.templates) await db.paycheckTemplates.update(t.id, { allocations: t.allocations });
  });
}
