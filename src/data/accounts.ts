import { db, getSetting, setSetting } from '../db/db';
import type { Account } from '../db/types';
import { moveItem, nextSortOrder } from '../domain/reorder';
import { UserFacingError } from './errors';

export type AccountInput = Pick<Account, 'name' | 'type' | 'startingBalance'>;

function clean(input: AccountInput): AccountInput {
  const name = input.name.trim();
  if (!name) throw new UserFacingError('Give the account a name.');
  if (!Number.isSafeInteger(input.startingBalance)) throw new UserFacingError('Enter a valid starting balance.');
  return { ...input, name };
}

export async function createAccount(input: AccountInput): Promise<number> {
  const data = clean(input);
  return db.transaction('rw', db.accounts, async () => {
    const all = await db.accounts.toArray();
    return db.accounts.add({ ...data, archived: false, sortOrder: nextSortOrder(all) });
  });
}

export async function updateAccount(id: number, input: AccountInput): Promise<void> {
  await db.accounts.update(id, clean(input));
}

export async function setAccountArchived(id: number, archived: boolean): Promise<void> {
  await db.transaction('rw', db.accounts, db.settings, async () => {
    if (archived) {
      const active = (await db.accounts.toArray()).filter((a) => !a.archived && a.id !== id);
      if (active.length === 0) throw new UserFacingError('You need at least one active account.');
      if ((await getSetting('lastUsedAccountId')) === id) await setSetting('lastUsedAccountId', active[0]?.id ?? null);
    }
    await db.accounts.update(id, { archived });
  });
}

export async function accountUsageCount(id: number): Promise<number> {
  const [from, to, bills, templates] = await Promise.all([
    db.transactions.where('accountId').equals(id).count(),
    db.transactions.where('toAccountId').equals(id).count(),
    db.recurringBills.where('accountId').equals(id).count(),
    db.paycheckTemplates.where('accountId').equals(id).count(),
  ]);
  return from + to + bills + templates;
}

/** Only unused accounts can be deleted; used ones should be archived so history stays intact. */
export async function deleteAccount(id: number): Promise<void> {
  if ((await accountUsageCount(id)) > 0) {
    throw new UserFacingError('This account has transactions or bills. Archive it instead.');
  }
  await db.transaction('rw', db.accounts, db.settings, async () => {
    const others = (await db.accounts.toArray()).filter((a) => !a.archived && a.id !== id);
    if (others.length === 0) throw new UserFacingError('You need at least one active account.');
    if ((await getSetting('lastUsedAccountId')) === id) await setSetting('lastUsedAccountId', others[0]?.id ?? null);
    await db.accounts.delete(id);
  });
}

export async function moveAccount(id: number, direction: 'up' | 'down'): Promise<void> {
  await db.transaction('rw', db.accounts, async () => {
    const active = (await db.accounts.toArray()).filter((a) => !a.archived);
    const changes = moveItem(active, id, direction);
    await Promise.all(changes.map((c) => db.accounts.update(c.id, { sortOrder: c.sortOrder })));
  });
}
