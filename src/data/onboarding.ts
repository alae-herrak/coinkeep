import { db, setSetting } from '../db/db';
import type { AccountType } from '../db/types';
import { todayISO } from '../lib/dates';
import { UserFacingError } from './errors';

export interface OnboardingInput {
  account: { name: string; type: AccountType; startingBalance: number } | null;
  goal: { name: string; icon: string; color: string; targetAmount: number | null; alreadySaved: number } | null;
}

export const DEFAULT_ACCOUNT = { name: 'Cash', type: 'cash' as const, startingBalance: 0 };

/**
 * Finishes onboarding in one transaction. Skipping still creates a "Cash"
 * account at 0 DH so quick-add works straight away.
 */
export async function completeOnboarding(input: OnboardingInput): Promise<void> {
  const account = input.account ?? DEFAULT_ACCOUNT;
  const name = account.name.trim() || DEFAULT_ACCOUNT.name;
  if (input.goal && !input.goal.name.trim()) throw new UserFacingError('Give your goal a name.');
  if (input.goal && input.goal.alreadySaved < 0) throw new UserFacingError('The amount saved can’t be negative.');

  await db.transaction('rw', [db.accounts, db.savingsGoals, db.savingsMovements, db.settings], async () => {
    let accountId: number;
    const existing = (await db.accounts.toArray()).filter((a) => !a.archived);
    if (existing.length > 0 && !input.account) {
      accountId = existing[0]!.id;
    } else {
      accountId = await db.accounts.add({ ...account, name, archived: false, sortOrder: existing.length });
    }

    if (input.goal) {
      const goalId = await db.savingsGoals.add({
        name: input.goal.name.trim(),
        icon: input.goal.icon,
        color: input.goal.color,
        targetAmount: input.goal.targetAmount,
        targetDate: null,
        archived: false,
      });
      if (input.goal.alreadySaved > 0) {
        await db.savingsMovements.add({
          goalId,
          amount: input.goal.alreadySaved,
          date: todayISO(),
          note: 'Starting amount',
          linkedTransactionId: null,
        });
      }
    }

    await setSetting('lastUsedAccountId', accountId);
    await setSetting('installedAt', Date.now());
    await setSetting('onboardingDone', true);
  });
}
